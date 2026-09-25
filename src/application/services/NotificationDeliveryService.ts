import {
  NOTIFICATION_DELIVERY_MESSAGE_SIZE,
  NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT,
  type NotificationDeliveryProcessingResult,
} from '../../domain/entities/NotificationDelivery';
import { firebasePlatformToName } from '../../domain/entities/FirebaseToken';
import type { INotificationDeliveryRepository } from '../../domain/interfaces/repositories/INotificationDeliveryRepository';
import type { INotificationDeliveryQueue } from '../../domain/interfaces/queues/INotificationDeliveryQueue';
import type { IFcmService } from './IFcmService';
import type { INotificationDeliveryService } from './INotificationDeliveryService';

const MAX_CONCURRENT_FCM_REQUESTS = 5;

export function createNotificationDeliveryService(deps: {
  notificationDeliveryRepository: INotificationDeliveryRepository;
  notificationDeliveryQueue: INotificationDeliveryQueue;
  fcmService: IFcmService;
}): INotificationDeliveryService {
  const {
    notificationDeliveryRepository,
    notificationDeliveryQueue,
    fcmService,
  } = deps;

  return {
    async enqueueReadySchedules(now = new Date()) {
      const nowIso = now.toISOString();
      const candidates =
        await notificationDeliveryRepository.findReadySchedules(
          nowIso,
          NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT
        );
      const result: NotificationDeliveryProcessingResult = {
        queued_schedule_ids: [],
        completed_schedule_ids: [],
        failed_schedule_ids: [],
      };

      for (const candidate of candidates) {
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
          const pendingCount =
            await notificationDeliveryRepository.countPendingDeliveries(
              scheduleId
            );
          if (pendingCount > 0) {
            result.queued_schedule_ids.push(scheduleId);
          } else if (
            await notificationDeliveryRepository.completeScheduleIfDone(
              scheduleId,
              nowIso
            )
          ) {
            result.completed_schedule_ids.push(scheduleId);
          }
        } catch (error) {
          console.error('[NOTIFICATION_DELIVERY] Schedule処理に失敗しました', {
            scheduleId,
            error: error instanceof Error ? error.message : String(error),
          });
          result.failed_schedule_ids.push(scheduleId);
        }
      }

      const messages = chunk(
        [...new Set(result.queued_schedule_ids)],
        NOTIFICATION_DELIVERY_MESSAGE_SIZE
      ).map(notificationScheduleIds => ({ notificationScheduleIds }));
      if (messages.length > 0) {
        await notificationDeliveryQueue.enqueueMany(messages);
      }
      result.queued_schedule_ids = [...new Set(result.queued_schedule_ids)];
      return result;
    },

    async sendQueuedNotifications(notificationScheduleIds, now = new Date()) {
      const uniqueScheduleIds = [...new Set(notificationScheduleIds)]
        .filter(id => Number.isSafeInteger(id) && id > 0)
        .slice(0, NOTIFICATION_DELIVERY_MESSAGE_SIZE);
      const nowIso = now.toISOString();
      const deliveries =
        await notificationDeliveryRepository.claimPendingDeliveries(
          uniqueScheduleIds,
          nowIso,
          NOTIFICATION_PUSH_DELIVERY_CANDIDATE_LIMIT
        );
      let sent = 0;
      let failed = 0;

      await mapWithConcurrency(
        deliveries,
        MAX_CONCURRENT_FCM_REQUESTS,
        async delivery => {
          let result;
          try {
            result = await fcmService.sendNotificationToToken({
              token: delivery.fcm_token,
              platform: firebasePlatformToName(delivery.platform),
              title: delivery.push_title,
              body: delivery.push_body,
              importance: importanceToNumber(delivery.importance),
              data: {
                type: 'manual',
                notificationId: String(delivery.notification_id),
              },
            });
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : String(error);
            await notificationDeliveryRepository.markFailed(
              delivery.notification_push_delivery_id,
              reason,
              nowIso
            );
            failed += 1;
            return;
          }
          await notificationDeliveryRepository.markSent(
            delivery.notification_push_delivery_id,
            result.messageId,
            nowIso
          );
          sent += 1;
        }
      );

      for (const scheduleId of uniqueScheduleIds) {
        await notificationDeliveryRepository.completeScheduleIfDone(
          scheduleId,
          nowIso
        );
      }

      return { claimed: deliveries.length, sent, failed };
    },
  };
}

function importanceToNumber(importance: 'low' | 'normal' | 'high'): number {
  switch (importance) {
    case 'low':
      return 1;
    case 'normal':
      return 2;
    case 'high':
      return 3;
  }
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size));
  }
  return chunks;
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const errors: unknown[] = [];
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          await mapper(values[currentIndex]);
        } catch (error) {
          errors.push(error);
        }
      }
    }
  );
  await Promise.all(workers);
  if (errors.length > 0) throw errors[0];
}
