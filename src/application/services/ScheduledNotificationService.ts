import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import { IFcmService } from './IFcmService';
import { IScheduledNotificationService } from './IScheduledNotificationService';

export function createScheduledNotificationService(deps: {
  firebaseTokenRepository: IFirebaseTokenRepository;
  notificationScheduleRepository: INotificationScheduleRepository;
  fcmService: IFcmService;
}): IScheduledNotificationService {
  const {
    firebaseTokenRepository,
    notificationScheduleRepository,
    fcmService,
  } = deps;

  return {
    async sendScheduledEventNotifications(now = new Date()) {
      const schedules = await notificationScheduleRepository.claimDue(
        now.toISOString()
      );
      let sent = 0;
      let failed = 0;

      for (const schedule of schedules) {
        if (schedule.is_firebase_active !== 1) {
          await notificationScheduleRepository.markFailed(
            schedule.notification_schedule_id,
            'Firebase token is inactive'
          );
          failed += 1;
          continue;
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
          sent += 1;
        } catch (error) {
          if (shouldDeactivateToken(error)) {
            await firebaseTokenRepository.deactivate(
              schedule.firebase_token_id
            );
          }
          failed += 1;
          await notificationScheduleRepository.markFailed(
            schedule.notification_schedule_id,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      return {
        checkedEvents: schedules.length,
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
