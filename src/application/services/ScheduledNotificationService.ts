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
        let result;
        try {
          result = await fcmService.sendNotificationToToken({
            token: schedule.fcm_token,
            title: schedule.title,
            body: schedule.body,
            data: {
              type: schedule.notification_type,
              eventId: String(schedule.event_id),
            },
          });
        } catch (error) {
          failed += 1;
          await notificationScheduleRepository.markFailed(
            schedule.notification_send_schedule_id,
            error instanceof Error ? error.message : String(error)
          );
          if (shouldDeactivateToken(error)) {
            await firebaseTokenRepository.deactivate(
              schedule.firebase_token_id
            );
          }
          continue;
        }
        // 送信自体は成功しているため、以降の記録失敗をmarkFailedとして
        // 誤って上書きしないようtry/catchの外で扱う。
        sent += 1;
        await notificationScheduleRepository.markSent(
          schedule.notification_send_schedule_id,
          result.messageId
        );
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
