import type { ClaimedNotificationPushDelivery } from '../../domain/entities/NotificationDelivery';
import { NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT } from '../../domain/entities/NotificationDelivery';
import { firebasePlatformToName } from '../../domain/entities/FirebaseToken';
import type { INotificationDeliveryRepository } from '../../domain/interfaces/repositories/INotificationDeliveryRepository';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { FcmRequestError, type IFcmService } from './IFcmService';
import type {
  INotificationRetryService,
  NotificationDeliveryOutcome,
} from './INotificationRetryService';

export const FCM_RETRY_OFFSETS_SECONDS = [10, 30, 120, 300, 900] as const;
export const FCM_PROCESSING_TIMEOUT_SECONDS = 120;
export const FCM_RATE_LIMIT_MIN_RETRY_DELAY_SECONDS = 70;

// HTTP v1の一時系Retryは公式表の429 / 500 / 503と対応error statusに限定する。
// INVALID_ARGUMENTでTokenは削除しない（payload不正でも返り得る）。
// https://firebase.google.com/docs/cloud-messaging/error-codes
export function classifyFcmError(
  error: unknown
): 'temporary' | 'permanent' | 'unregistered' {
  if (!(error instanceof FcmRequestError)) return 'temporary';
  if (error.fcmErrorCode === 'UNREGISTERED') return 'unregistered';
  if (
    [
      'INVALID_ARGUMENT',
      'SENDER_ID_MISMATCH',
      'THIRD_PARTY_AUTH_ERROR',
    ].includes(error.fcmErrorCode ?? '')
  )
    return 'permanent';
  if (
    [429, 500, 503].includes(error.httpStatus) ||
    ['QUOTA_EXCEEDED', 'INTERNAL', 'UNAVAILABLE'].includes(
      error.fcmErrorCode ?? ''
    )
  )
    return 'temporary';
  return 'permanent';
}

export function createNotificationRetryService(deps: {
  notificationDeliveryRepository: INotificationDeliveryRepository;
  firebaseTokenRepository: Pick<IFirebaseTokenRepository, 'deleteById'>;
  fcmService: IFcmService;
}): INotificationRetryService {
  const repository = deps.notificationDeliveryRepository;
  const sendClaimedDelivery = async (
    delivery: ClaimedNotificationPushDelivery,
    now = new Date()
  ): Promise<NotificationDeliveryOutcome> => {
    const nowIso = now.toISOString();
    let messageId: string;
    try {
      const response = await deps.fcmService.sendNotificationToToken({
        token: delivery.fcm_token,
        platform: firebasePlatformToName(delivery.platform),
        title: delivery.push_title,
        body: delivery.push_body,
        importance: { low: 1, normal: 2, high: 3 }[delivery.importance],
        data: {
          type: delivery.notification_type,
          notificationId: String(delivery.notification_id),
        },
      });
      messageId = response.messageId;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const classification = classifyFcmError(error);
      if (classification === 'unregistered')
        await deps.firebaseTokenRepository.deleteById(
          delivery.firebase_token_id
        );
      const nextMilestone = FCM_RETRY_OFFSETS_SECONDS.map(
        offset => Date.parse(delivery.first_attempt_at) + offset * 1000
      ).find(milestone => milestone > now.getTime());
      const retryWindowEndsAt =
        Date.parse(delivery.first_attempt_at) +
        FCM_RETRY_OFFSETS_SECONDS[FCM_RETRY_OFFSETS_SECONDS.length - 1] * 1000;
      if (classification !== 'temporary' || nextMilestone === undefined) {
        return (await repository.markFailed(
          delivery.notification_push_delivery_id,
          reason,
          nowIso,
          delivery.attempt_count
        ))
          ? 'failed'
          : 'superseded';
      }
      const retryAfter =
        error instanceof FcmRequestError ? (error.retryAfterSeconds ?? 0) : 0;
      const rateLimited =
        error instanceof FcmRequestError &&
        (error.httpStatus === 429 || error.fcmErrorCode === 'QUOTA_EXCEEDED');
      const rateLimitNotBefore =
        now.getTime() +
        Math.max(
          retryAfter,
          rateLimited ? FCM_RATE_LIMIT_MIN_RETRY_DELAY_SECONDS : 0
        ) *
          1000;
      const nextRetryAt = Math.max(nextMilestone, rateLimitNotBefore);
      if (nextRetryAt > retryWindowEndsAt) {
        return (await repository.markFailed(
          delivery.notification_push_delivery_id,
          reason,
          nowIso,
          delivery.attempt_count
        ))
          ? 'failed'
          : 'superseded';
      }
      return repository.saveRetry(
        delivery.notification_push_delivery_id,
        delivery.attempt_count,
        reason,
        new Date(nextRetryAt).toISOString(),
        nowIso
      );
    }
    // DB保存失敗はFCM失敗として処理せず、timeout回収へ委ねる。
    return (await repository.markSent(
      delivery.notification_push_delivery_id,
      messageId,
      nowIso,
      delivery.attempt_count
    ))
      ? 'sent'
      : 'superseded';
  };
  return {
    sendClaimedDelivery,
    async retryDueDeliveries(now = new Date()) {
      const nowIso = now.toISOString();
      const staleBefore = new Date(
        now.getTime() - FCM_PROCESSING_TIMEOUT_SECONDS * 1000
      ).toISOString();
      const retiredScheduleIds = await repository.retireUnsendableDeliveries(
        nowIso,
        staleBefore,
        FCM_RETRY_OFFSETS_SECONDS.length + 1
      );
      const deliveries = await repository.claimRetryDeliveries(
        nowIso,
        staleBefore,
        NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT
      );
      const result = { claimed: deliveries.length, sent: 0, failed: 0 };
      const errors: unknown[] = [];
      for (const delivery of deliveries) {
        try {
          const outcome = await sendClaimedDelivery(delivery, now);
          if (outcome === 'sent') result.sent++;
          if (outcome === 'failed') result.failed++;
        } catch (error) {
          errors.push(error);
        }
      }
      for (const scheduleId of new Set([
        ...retiredScheduleIds,
        ...deliveries.map(delivery => delivery.notification_schedule_id),
      ]))
        await repository.completeScheduleIfDone(scheduleId, nowIso);
      if (errors.length > 0) throw errors[0];
      return result;
    },
  };
}
