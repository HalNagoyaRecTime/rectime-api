import type { ClaimedNotificationPushDelivery } from '../../domain/entities/NotificationDelivery';
import { firebasePlatformToName } from '../../domain/entities/FirebaseToken';
import type { INotificationDeliveryRepository } from '../../domain/interfaces/repositories/INotificationDeliveryRepository';
import type { INotificationDeliveryQueue } from '../../domain/interfaces/queues/INotificationDeliveryQueue';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { FcmRequestError, type IFcmService } from './IFcmService';
import { classifyFcmError } from './FcmErrorPolicy';
export { classifyFcmError } from './FcmErrorPolicy';
import type {
  INotificationRetryService,
  NotificationDeliveryOutcome,
} from './INotificationRetryService';

import {
  FCM_RETRY_OFFSETS_SECONDS,
  FCM_RETRY_WINDOW_SECONDS,
  FCM_MAX_ATTEMPTS,
  FCM_PROCESSING_TIMEOUT_SECONDS,
  FCM_RATE_LIMIT_MIN_RETRY_DELAY_SECONDS,
  FCM_CONFIG_BLOCKED_REASON,
  FCM_CONFIG_RETRY_DELAY_SECONDS,
} from '../../domain/entities/NotificationRetryPolicy';
export {
  FCM_RETRY_OFFSETS_SECONDS,
  FCM_PROCESSING_TIMEOUT_SECONDS,
  FCM_RATE_LIMIT_MIN_RETRY_DELAY_SECONDS,
} from '../../domain/entities/NotificationRetryPolicy';

export function createNotificationRetryService(deps: {
  notificationDeliveryRepository: INotificationDeliveryRepository;
  firebaseTokenRepository: Pick<IFirebaseTokenRepository, 'deleteById'>;
  fcmService: IFcmService;
  notificationDeliveryQueue?: INotificationDeliveryQueue;
  ensureConfigured?: () => Promise<void>;
}): INotificationRetryService {
  const repository = deps.notificationDeliveryRepository;
  const ensureConfigured = deps.ensureConfigured ?? (async () => {});
  const sendClaimedDelivery = async (
    delivery: ClaimedNotificationPushDelivery,
    now = new Date()
  ): Promise<NotificationDeliveryOutcome> => {
    const nowIso = now.toISOString();
    const ownsLease = await repository.renewDeliveryLease(
      delivery.notification_push_delivery_id,
      delivery.attempt_count,
      nowIso,
      new Date(
        now.getTime() - FCM_PROCESSING_TIMEOUT_SECONDS * 1000
      ).toISOString()
    );
    if (!ownsLease) return 'superseded';
    let messageId: string;
    try {
      const response = await deps.fcmService.sendNotificationToToken({
        token: delivery.fcm_token,
        platform: firebasePlatformToName(delivery.platform),
        title: delivery.push_title,
        body: delivery.push_body,
        importance: { low: 1, normal: 2, high: 3 }[delivery.importance],
        data: {
          // モバイルの通知詳細遷移で使用する既存のpayload契約を維持する。
          type:
            delivery.notification_type === 'notification_general'
              ? 'manual'
              : delivery.notification_type,
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
      // 認証・権限設定の障害は15分の通常Retry期限を適用しない。
      if (classification === 'configuration') {
        return repository.saveRetry(
          delivery.notification_push_delivery_id,
          delivery.attempt_count,
          FCM_CONFIG_BLOCKED_REASON,
          new Date(
            now.getTime() + FCM_CONFIG_RETRY_DELAY_SECONDS * 1000
          ).toISOString(),
          nowIso
        );
      }
      const nextMilestone = FCM_RETRY_OFFSETS_SECONDS.map(
        offset => Date.parse(delivery.first_attempt_at) + offset * 1000
      ).find(milestone => milestone > now.getTime());
      const retryWindowEndsAt =
        Date.parse(delivery.first_attempt_at) + FCM_RETRY_WINDOW_SECONDS * 1000;
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
    async enqueueDueDeliveries(now = new Date()) {
      await ensureConfigured();
      if (!deps.notificationDeliveryQueue)
        throw new Error('再送Queueが設定されていません');
      const nowIso = now.toISOString();
      const staleBefore = new Date(
        now.getTime() - FCM_PROCESSING_TIMEOUT_SECONDS * 1000
      ).toISOString();
      const retired = await repository.retireUnsendableDeliveries(
        nowIso,
        staleBefore,
        FCM_MAX_ATTEMPTS
      );
      for (const id of retired)
        await repository.completeScheduleIfDone(id, nowIso);
      let afterId = 0;
      let queued = 0;
      while (true) {
        const ids = await repository.findDueRetryDeliveryIds(
          nowIso,
          staleBefore,
          afterId,
          90
        );
        if (ids.length === 0) break;
        // Queueに入れる段階ではclaimせず、実際に送信するWorkerが取得する。
        await deps.notificationDeliveryQueue.enqueueMany([
          { notificationScheduleIds: [], retryDeliveryIds: ids },
        ]);
        queued += ids.length;
        afterId = ids[ids.length - 1];
      }
      return queued;
    },
    async retryDueDeliveries(now, deliveryIds) {
      await ensureConfigured();
      const suppliedNow = now;
      const clock = suppliedNow ? () => suppliedNow : () => new Date();
      now = clock();
      const nowIso = now.toISOString();
      const staleBefore = new Date(
        now.getTime() - FCM_PROCESSING_TIMEOUT_SECONDS * 1000
      ).toISOString();
      const retiredScheduleIds = await repository.retireUnsendableDeliveries(
        nowIso,
        staleBefore,
        FCM_MAX_ATTEMPTS
      );
      const result = { claimed: 0, sent: 0, failed: 0 };
      const errors: unknown[] = [];
      const scheduleIds = new Set<number>();
      while (true) {
        const current = clock();
        const deliveries = await repository.claimRetryDeliveries(
          current.toISOString(),
          new Date(
            current.getTime() - FCM_PROCESSING_TIMEOUT_SECONDS * 1000
          ).toISOString(),
          5,
          deliveryIds
        );
        if (deliveries.length === 0) break;
        result.claimed += deliveries.length;
        await Promise.all(
          deliveries.map(async delivery => {
            scheduleIds.add(delivery.notification_schedule_id);
            try {
              const outcome = await sendClaimedDelivery(delivery, current);
              if (outcome === 'sent') result.sent++;
              if (outcome === 'failed') result.failed++;
            } catch (error) {
              errors.push(error);
            }
          })
        );
      }
      for (const scheduleId of new Set([...retiredScheduleIds, ...scheduleIds]))
        await repository.completeScheduleIfDone(scheduleId, nowIso);
      if (errors.length > 0) throw errors[0];
      return result;
    },
  };
}
