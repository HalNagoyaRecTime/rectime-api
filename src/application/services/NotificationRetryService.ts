import { FcmRequestError } from './IFcmService';
import type { IFcmService } from './IFcmService';
import type { INotificationRetryRepository } from '../../domain/interfaces/repositories/INotificationRetryRepository';
import type { NotificationPushDeliverySendTarget } from '../../domain/interfaces/repositories/INotificationPushDeliveryRepository';
import type {
  INotificationRetryService,
  NotificationRetryBatchResult,
  NotificationRetryFailureInput,
  NotificationRetryResult,
} from './INotificationRetryService';

export const FCM_RETRY_OFFSETS_SECONDS = [10, 30, 120, 300, 900] as const;
export const FCM_PROCESSING_TIMEOUT_SECONDS = 120;
export const FCM_RATE_LIMIT_MIN_RETRY_DELAY_SECONDS = 70;
const DEFAULT_RETRY_BATCH_LIMIT = 100;

export function createNotificationRetryService(deps: {
  repository: INotificationRetryRepository;
  fcmService: IFcmService;
}): INotificationRetryService {
  const { repository, fcmService } = deps;

  return {
    async handleFcmFailure(input, now = new Date()) {
      return handleFcmFailureWithRepository(repository, input, now);
    },

    async retryDueDeliveries(
      now = new Date(),
      limit = DEFAULT_RETRY_BATCH_LIMIT
    ) {
      const nowIso = now.toISOString();
      const deliveryIds = await repository.findRetryableDeliveryIds(
        nowIso,
        limit
      );
      return processDeliveryIds(deliveryIds, now);
    },

    async recoverProcessingTimeouts(
      now = new Date(),
      limit = DEFAULT_RETRY_BATCH_LIMIT
    ) {
      const staleBefore = new Date(
        now.getTime() - FCM_PROCESSING_TIMEOUT_SECONDS * 1000
      ).toISOString();
      const deliveryIds = await repository.findTimedOutDeliveryIds(
        staleBefore,
        limit
      );
      return processDeliveryIds(deliveryIds, now, staleBefore);
    },
  };

  async function processDeliveryIds(
    deliveryIds: number[],
    now: Date,
    staleBefore?: string
  ): Promise<NotificationRetryBatchResult> {
    const result: NotificationRetryBatchResult = {
      checked: deliveryIds.length,
      sent: 0,
      retried: 0,
      failed: 0,
    };
    for (const deliveryId of deliveryIds) {
      const target = staleBefore
        ? await repository.claimTimedOutDelivery(
            deliveryId,
            staleBefore,
            now.toISOString()
          )
        : await repository.claimRetryableDelivery(
            deliveryId,
            now.toISOString()
          );
      if (!target) continue;

      const outcome = await sendClaimedDelivery(target, now);
      if (outcome.status === 'sent') result.sent += 1;
      if (outcome.status === 'retry_wait') result.retried += 1;
      if (outcome.status === 'failed') result.failed += 1;
    }
    return result;
  }

  async function sendClaimedDelivery(
    target: NotificationPushDeliverySendTarget,
    now: Date
  ): Promise<NotificationRetryResult | { status: 'sent' }> {
    const nowIso = now.toISOString();
    let result: { messageId: string };
    try {
      result = await fcmService.sendNotificationToToken({
        token: target.fcmToken,
        platform: target.platform === 1 ? 'ios' : 'android',
        title: target.title,
        body: target.body,
        importance: target.importance,
        data: {
          type: target.notificationType,
          ...(target.notificationType === 'manual'
            ? { notificationId: String(target.notificationId) }
            : {}),
          ...(target.eventId == null
            ? {}
            : { eventId: String(target.eventId) }),
        },
      });
    } catch (error) {
      return handleFcmFailureWithRepository(
        repository,
        {
          deliveryId: target.deliveryId,
          scheduleId: target.scheduleId,
          firebaseTokenId: target.firebaseTokenId,
          attemptCount: target.attemptCount,
          error,
        },
        now
      );
    }
    await repository.markDeliverySent(
      target.deliveryId,
      result.messageId,
      nowIso
    );
    await repository.completeScheduleIfIdle(target.scheduleId, nowIso);
    return { status: 'sent' };
  }
}

async function handleFcmFailureWithRepository(
  repository: INotificationRetryRepository,
  input: NotificationRetryFailureInput,
  now: Date
): Promise<NotificationRetryResult> {
  const nowIso = now.toISOString();
  if (await repository.isScheduleStopped(input.scheduleId)) {
    return { status: 'skipped', scheduleCompleted: false, tokenDeleted: false };
  }

  const classification = classifyFcmError(input.error);
  if (classification === 'token') {
    await repository.deleteFirebaseToken(input.firebaseTokenId);
    await repository.markDeliveryFailed(
      input.deliveryId,
      toErrorMessage(input.error),
      nowIso
    );
    const scheduleCompleted = await repository.completeScheduleIfIdle(
      input.scheduleId,
      nowIso
    );
    return { status: 'failed', scheduleCompleted, tokenDeleted: true };
  }

  if (classification === 'permanent') {
    await repository.markDeliveryFailed(
      input.deliveryId,
      toErrorMessage(input.error),
      nowIso
    );
    const scheduleCompleted = await repository.completeScheduleIfIdle(
      input.scheduleId,
      nowIso
    );
    return { status: 'failed', scheduleCompleted, tokenDeleted: false };
  }

  const retryDelaySeconds = getRetryDelaySeconds(
    input.error,
    input.attemptCount
  );
  if (retryDelaySeconds == null) {
    await repository.markDeliveryFailed(
      input.deliveryId,
      toErrorMessage(input.error),
      nowIso
    );
    const scheduleCompleted = await repository.completeScheduleIfIdle(
      input.scheduleId,
      nowIso
    );
    return { status: 'failed', scheduleCompleted, tokenDeleted: false };
  }

  const nextRetryAt = new Date(
    now.getTime() + retryDelaySeconds * 1000
  ).toISOString();
  const scheduled = await repository.scheduleRetry(
    input.deliveryId,
    nextRetryAt,
    toErrorMessage(input.error),
    nowIso
  );
  return scheduled
    ? { status: 'retry_wait', scheduleCompleted: false, tokenDeleted: false }
    : { status: 'skipped', scheduleCompleted: false, tokenDeleted: false };
}

type FcmErrorClassification = 'retry' | 'permanent' | 'token';

function classifyFcmError(error: unknown): FcmErrorClassification {
  if (!(error instanceof FcmRequestError)) return 'retry';
  if (error.fcmErrorCode === 'UNREGISTERED') return 'token';
  if (error.httpStatus === 429 || error.fcmErrorCode === 'QUOTA_EXCEEDED') {
    return 'retry';
  }
  if (
    error.httpStatus === 500 ||
    error.httpStatus === 503 ||
    error.httpStatus === 408 ||
    error.fcmErrorCode === 'INTERNAL' ||
    error.fcmErrorCode === 'UNAVAILABLE'
  ) {
    return 'retry';
  }
  // INVALID_ARGUMENTはpayload不正でも発生するため、Tokenを削除せず
  // Deliveryだけを恒久失敗にする。
  return 'permanent';
}

function getRetryDelaySeconds(
  error: unknown,
  attemptCount: number
): number | null {
  const offset = FCM_RETRY_OFFSETS_SECONDS[attemptCount - 1];
  if (offset == null) return null;
  if (
    error instanceof FcmRequestError &&
    (error.httpStatus === 429 || error.fcmErrorCode === 'QUOTA_EXCEEDED')
  ) {
    return Math.max(
      FCM_RATE_LIMIT_MIN_RETRY_DELAY_SECONDS,
      error.retryAfterSeconds ?? 0,
      offset
    );
  }
  return offset;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
