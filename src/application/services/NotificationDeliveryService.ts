import {
  NOTIFICATION_DELIVERY_MESSAGE_SIZE,
  NOTIFICATION_READY_SCHEDULE_CANDIDATE_LIMIT,
  NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT,
  type NotificationDeliveryMessage,
  type NotificationDeliveryProcessingResult,
} from '../../domain/entities/NotificationDelivery';
import { createNotificationRetryService } from './NotificationRetryService';
import type { INotificationRetryService } from './INotificationRetryService';
import type { INotificationDeliveryRepository } from '../../domain/interfaces/repositories/INotificationDeliveryRepository';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import type { INotificationDeliveryQueue } from '../../domain/interfaces/queues/INotificationDeliveryQueue';
import type { IFcmService } from './IFcmService';
import type { INotificationDeliveryService } from './INotificationDeliveryService';

const MAX_CONCURRENT_FCM_REQUESTS = 5;
const MAX_MESSAGES_PER_SCHEDULE_PER_CRON = 40;
const MAX_MESSAGES_PER_CRON = 100;
// Delivery IDのペイロードが256KBのsendBatch上限に触れないよう分割する。
const QUEUE_DISPATCH_BATCH_SIZE = 40;
const TOKEN_REMOVED_BEFORE_DELIVERY_REASON =
  'Firebase token was removed before delivery';

export function createNotificationDeliveryService(deps: {
  notificationRetryService?: INotificationRetryService;
  notificationDeliveryRepository: INotificationDeliveryRepository;
  firebaseTokenRepository: Pick<IFirebaseTokenRepository, 'deleteById'>;
  notificationDeliveryQueue: INotificationDeliveryQueue;
  fcmService: IFcmService;
  ensureConfigured?: () => Promise<void>;
}): INotificationDeliveryService {
  const {
    notificationDeliveryRepository,
    notificationDeliveryQueue,
    ensureConfigured = async () => {},
  } = deps;
  const retryService =
    deps.notificationRetryService ?? createNotificationRetryService(deps);
  const failPendingDeliveriesWithoutToken = (scheduleId: number, now: string) =>
    notificationDeliveryRepository.markPendingDeliveriesWithoutTokenFailed(
      scheduleId,
      TOKEN_REMOVED_BEFORE_DELIVERY_REASON,
      now
    );

  const processDeliveryIds = async (
    deliveryIds: number[],
    clock: () => Date,
    manualOnly?: boolean
  ) => {
    let claimed = 0;
    let sent = 0;
    let failed = 0;
    const scheduleIds = new Set<number>();
    // leaseは5件単位で取得して送信直前に更新する。
    for (
      let offset = 0;
      offset < deliveryIds.length;
      offset += MAX_CONCURRENT_FCM_REQUESTS
    ) {
      const current = clock();
      const deliveries =
        await notificationDeliveryRepository.claimPendingDeliveries(
          deliveryIds.slice(offset, offset + MAX_CONCURRENT_FCM_REQUESTS),
          current.toISOString(),
          manualOnly
        );
      claimed += deliveries.length;
      for (const delivery of deliveries) {
        scheduleIds.add(delivery.notification_schedule_id);
      }
      const outcomes = await retryService.sendClaimedDeliveries(
        deliveries,
        current
      );
      for (const outcome of outcomes) {
        if (outcome === 'sent') sent++;
        if (outcome === 'failed') failed++;
      }
    }
    return { claimed, sent, failed, scheduleIds };
  };

  const completeSchedulesIfReady = async (
    scheduleIds: Iterable<number>,
    nowIso: string
  ) => {
    let failed = 0;
    for (const scheduleId of scheduleIds) {
      if (
        !(await notificationDeliveryRepository.hasPendingDeliveries(scheduleId))
      ) {
        failed += await failPendingDeliveriesWithoutToken(scheduleId, nowIso);
        await notificationDeliveryRepository.completeScheduleIfDone(
          scheduleId,
          nowIso
        );
      }
    }
    return failed;
  };

  return {
    async enqueueReadySchedules(now = new Date(), options) {
      // 配信をclaimする前に検証し、設定不備で未送信データを失敗確定にしない。
      await ensureConfigured();
      const nowIso = now.toISOString();
      const candidates =
        await notificationDeliveryRepository.findReadySchedules(
          nowIso,
          NOTIFICATION_READY_SCHEDULE_CANDIDATE_LIMIT,
          options?.manualOnly
        );
      const result: NotificationDeliveryProcessingResult = {
        queued_schedule_ids: [],
        completed_schedule_ids: [],
        failed_schedule_ids: [],
      };
      const messages: NotificationDeliveryMessage[] = [];

      for (const [candidateIndex, candidate] of candidates.entries()) {
        const scheduleId = candidate.notification_schedule_id;
        try {
          if (candidate.send_status === 'resolving') {
            try {
              const completedImmediately =
                await notificationDeliveryRepository.prepareResolvedSchedule(
                  scheduleId,
                  nowIso
                );
              if (completedImmediately) {
                result.completed_schedule_ids.push(scheduleId);
                continue;
              }
            } catch (error) {
              const reason =
                error instanceof Error ? error.message : String(error);
              try {
                await notificationDeliveryRepository.markScheduleFailed(
                  scheduleId,
                  reason,
                  nowIso
                );
              } catch (failureError) {
                console.error(
                  '[NOTIFICATION_DELIVERY] Schedule失敗状態を保存できませんでした',
                  {
                    scheduleId,
                    error:
                      failureError instanceof Error
                        ? failureError.message
                        : String(failureError),
                  }
                );
              }
              throw error;
            }
          }
          if (
            await notificationDeliveryRepository.hasPendingDeliveries(
              scheduleId
            )
          ) {
            // 順序付きIDカーソルで漏れ・重複のない分割メッセージを作成する。
            // CronのD1負荷を抑え、投入しきれない残件は次のCronで回収する。
            const available = Math.min(
              MAX_MESSAGES_PER_SCHEDULE_PER_CRON,
              Math.floor(
                (MAX_MESSAGES_PER_CRON - messages.length) /
                  (candidates.length - candidateIndex)
              )
            );
            let afterId = 0;
            let queued = false;
            for (let index = 0; index < available; index++) {
              const deliveryIds =
                await notificationDeliveryRepository.findPendingDeliveryIds(
                  [scheduleId],
                  NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT,
                  options?.manualOnly,
                  afterId
                );
              if (deliveryIds.length === 0) break;
              messages.push({ notificationScheduleIds: [], deliveryIds });
              queued = true;
              afterId = deliveryIds[deliveryIds.length - 1];
              if (
                deliveryIds.length < NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT
              )
                break;
            }
            if (queued) result.queued_schedule_ids.push(scheduleId);
          } else {
            await failPendingDeliveriesWithoutToken(scheduleId, nowIso);
            if (
              await notificationDeliveryRepository.completeScheduleIfDone(
                scheduleId,
                nowIso
              )
            ) {
              result.completed_schedule_ids.push(scheduleId);
            }
          }
        } catch (error) {
          console.error('[NOTIFICATION_DELIVERY] Schedule処理に失敗しました', {
            scheduleId,
            error: error instanceof Error ? error.message : String(error),
          });
          result.failed_schedule_ids.push(scheduleId);
        }
      }

      for (
        let offset = 0;
        offset < messages.length;
        offset += QUEUE_DISPATCH_BATCH_SIZE
      ) {
        await notificationDeliveryQueue.enqueueMany(
          messages.slice(offset, offset + QUEUE_DISPATCH_BATCH_SIZE)
        );
      }
      return result;
    },

    async sendQueuedDeliveryIds(deliveryIds, now, options) {
      const clock = now ? () => now : () => new Date();
      const nowIso = clock().toISOString();
      // QueueにあるIDを信用せず、再度DB側のstatus・Scheduleを原子的に検証する。
      await ensureConfigured();
      const uniqueIds = [...new Set(deliveryIds)]
        .filter(id => Number.isSafeInteger(id) && id > 0)
        .slice(0, NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT);
      const processed = await processDeliveryIds(
        uniqueIds,
        clock,
        options?.manualOnly
      );
      const failed =
        processed.failed +
        (await completeSchedulesIfReady(processed.scheduleIds, nowIso));
      return { claimed: processed.claimed, sent: processed.sent, failed };
    },

    async sendQueuedNotifications(notificationScheduleIds, now, options) {
      // デプロイ前に積まれた旧形式のScheduleメッセージも引き続き処理する。
      const clock = now ? () => now : () => new Date();
      const nowIso = clock().toISOString();
      await ensureConfigured();
      const scheduleIds = [...new Set(notificationScheduleIds)]
        .filter(id => Number.isSafeInteger(id) && id > 0)
        .slice(0, NOTIFICATION_DELIVERY_MESSAGE_SIZE);
      const deliveryIds =
        await notificationDeliveryRepository.findPendingDeliveryIds(
          scheduleIds,
          NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT,
          options?.manualOnly
        );
      const processed = await processDeliveryIds(
        deliveryIds,
        clock,
        options?.manualOnly
      );
      const failed =
        processed.failed +
        (await completeSchedulesIfReady(scheduleIds, nowIso));
      return { claimed: processed.claimed, sent: processed.sent, failed };
    },
  };
}
