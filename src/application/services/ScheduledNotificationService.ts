import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import { IFcmService } from './IFcmService';
import { IScheduledNotificationService } from './IScheduledNotificationService';

const NOTIFICATION_DELIVERY_BATCH_SIZE = 100;
const NOTIFICATION_DELIVERY_TIME_BUDGET_MS = 13 * 60 * 1000;

export function createScheduledNotificationService(deps: {
  firebaseTokenRepository: IFirebaseTokenRepository;
  notificationScheduleRepository: INotificationScheduleRepository;
  fcmService: IFcmService;
  getCurrentTime?: () => number;
}): IScheduledNotificationService {
  const {
    firebaseTokenRepository,
    notificationScheduleRepository,
    fcmService,
  } = deps;
  const getCurrentTime = deps.getCurrentTime ?? Date.now;

  return {
    async sendScheduledEventNotifications(now = new Date()) {
      const startedAt = getCurrentTime();
      const dueAt = now.toISOString();
      let checkedEvents = 0;
      let sent = 0;
      let failed = 0;

      while (
        getCurrentTime() - startedAt <
        NOTIFICATION_DELIVERY_TIME_BUDGET_MS
      ) {
        const schedules = await notificationScheduleRepository.claimDue(
          dueAt,
          NOTIFICATION_DELIVERY_BATCH_SIZE
        );
        if (schedules.length === 0) break;

        checkedEvents += schedules.length;
        const results = await Promise.all(
          schedules.map(async schedule => {
            if (schedule.is_firebase_active !== 1) {
              await notificationScheduleRepository.markFailed(
                schedule.notification_schedule_id,
                'Firebase token is inactive'
              );
              return 'failed';
            }

            try {
              const result = await fcmService.sendNotificationToToken({
                token: schedule.fcm_token,
                title: schedule.title,
                body: schedule.body,
                data: {
                  type: schedule.notification_type,
                  ...(schedule.event_id == null
                    ? {}
                    : { eventId: String(schedule.event_id) }),
                },
              });
              await notificationScheduleRepository.markSent(
                schedule.notification_schedule_id,
                result.messageId
              );
              return 'sent';
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
              return 'failed';
            }
          })
        );

        for (const result of results) {
          if (result === 'sent') {
            sent += 1;
          } else {
            failed += 1;
          }
        }

        if (schedules.length < NOTIFICATION_DELIVERY_BATCH_SIZE) {
          break;
        }
      }

      return {
        checkedEvents,
        sent,
        failed,
      };
    },
  };
}

function shouldDeactivateToken(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('UNREGISTERED') ||
    message.includes('invalid token') ||
    message.includes('INVALID_ARGUMENT')
  );
}
