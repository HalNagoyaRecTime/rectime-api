import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { firebasePlatformToName } from '../../domain/entities/FirebaseToken';
import { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import type { INotificationDeliveryQueue } from '../../domain/interfaces/queues/INotificationDeliveryQueue';
import {
  NOTIFICATION_DELIVERY_CANDIDATE_LIMIT,
  NOTIFICATION_DELIVERY_LEASE_TIMEOUT_MS,
  NOTIFICATION_DELIVERY_MESSAGE_SIZE,
} from '../../domain/entities/NotificationDelivery';
import { IFcmService, isPermanentFcmTokenError } from './IFcmService';
import { IScheduledNotificationService } from './IScheduledNotificationService';

const MAX_CONCURRENT_FCM_REQUESTS = 5;

export function createScheduledNotificationService(deps: {
  firebaseTokenRepository: IFirebaseTokenRepository;
  notificationScheduleRepository: INotificationScheduleRepository;
  notificationDeliveryQueue: INotificationDeliveryQueue;
  fcmService: IFcmService;
}): IScheduledNotificationService {
  const {
    firebaseTokenRepository,
    notificationScheduleRepository,
    notificationDeliveryQueue,
    fcmService,
  } = deps;

  return {
    async enqueueDueNotifications(now = new Date()) {
      const dueAt = now.toISOString();
      const staleBefore = new Date(
        now.getTime() - NOTIFICATION_DELIVERY_LEASE_TIMEOUT_MS
      ).toISOString();
      const candidateIds =
        await notificationScheduleRepository.findDeliveryCandidateIds(
          dueAt,
          staleBefore,
          NOTIFICATION_DELIVERY_CANDIDATE_LIMIT
        );
      const messages = chunk(
        candidateIds,
        NOTIFICATION_DELIVERY_MESSAGE_SIZE
      ).map(notificationScheduleIds => ({ notificationScheduleIds }));

      if (messages.length > 0) {
        await notificationDeliveryQueue.enqueueMany(messages);
      }

      return {
        queuedSchedules: candidateIds.length,
        queuedMessages: messages.length,
      };
    },

    async sendQueuedNotifications(notificationScheduleIds, now = new Date()) {
      const uniqueScheduleIds = [...new Set(notificationScheduleIds)].slice(
        0,
        NOTIFICATION_DELIVERY_MESSAGE_SIZE
      );
      const staleBefore = new Date(
        now.getTime() - NOTIFICATION_DELIVERY_LEASE_TIMEOUT_MS
      ).toISOString();
      const schedules = await notificationScheduleRepository.claimForDelivery(
        uniqueScheduleIds,
        now.toISOString(),
        staleBefore
      );
      const results = await mapWithConcurrency(
        schedules,
        MAX_CONCURRENT_FCM_REQUESTS,
        async schedule => {
          if (schedule.is_firebase_active !== 1) {
            await notificationScheduleRepository.markFailed(
              schedule.notification_schedule_id,
              'Firebase token is inactive'
            );
            return 'failed' as const;
          }

          let result;
          try {
            result = await fcmService.sendNotificationToToken({
              token: schedule.fcm_token,
              platform: firebasePlatformToName(schedule.platform),
              title: schedule.title,
              body: schedule.body,
              importance: schedule.importance,
              data: {
                type: schedule.notification_type,
                ...(schedule.notification_type === 'manual'
                  ? { notificationId: String(schedule.notification_id) }
                  : {}),
                ...(schedule.event_id == null
                  ? {}
                  : { eventId: String(schedule.event_id) }),
              },
            });
          } catch (error) {
            if (shouldDeactivateToken(error)) {
              await firebaseTokenRepository.deactivate(
                schedule.firebase_token_id
              );
            }
            await notificationScheduleRepository.markFailed(
              schedule.notification_schedule_id,
              error instanceof Error ? error.message : String(error)
            );
            return 'failed' as const;
          }
          await notificationScheduleRepository.markSent(
            schedule.notification_schedule_id,
            result.messageId
          );
          return 'sent' as const;
        }
      );

      return {
        checkedEvents: schedules.length,
        sent: results.filter(result => result === 'sent').length,
        failed: results.filter(result => result === 'failed').length,
      };
    },
  };
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  const errors: unknown[] = [];
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          results[currentIndex] = await mapper(values[currentIndex]);
        } catch (error) {
          errors.push(error);
        }
      }
    }
  );
  await Promise.all(workers);

  if (errors.length > 0) {
    throw errors[0];
  }

  return results;
}

function shouldDeactivateToken(error: unknown): boolean {
  return isPermanentFcmTokenError(error);
}
