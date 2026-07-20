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
      const targetTokens =
        await notificationScheduleRepository.findTargetTokensByGatheringGroupIds(
          [...new Set(schedules.map(schedule => schedule.gathering_group_id))]
        );
      const tokensByGroup = new Map<number, typeof targetTokens>();
      for (const token of targetTokens) {
        const groupTokens = tokensByGroup.get(token.gathering_group_id) ?? [];
        groupTokens.push(token);
        tokensByGroup.set(token.gathering_group_id, groupTokens);
      }
      let sent = 0;
      let failed = 0;

      for (const schedule of schedules) {
        const tokens = tokensByGroup.get(schedule.gathering_group_id) ?? [];
        if (tokens.length === 0) {
          await notificationScheduleRepository.markFailed(
            schedule.notification_send_schedule_id,
            'No active Firebase tokens for gathering group'
          );
          failed += 1;
          continue;
        }
        let messageId = '';
        let sentForSchedule = 0;
        let failure: unknown;
        for (const token of tokens) {
          try {
            const result = await fcmService.sendNotificationToToken({
              token: token.fcm_token,
              title: schedule.title,
              body: schedule.body,
              data: {
                type: schedule.notification_type,
                eventId: String(schedule.event_id),
              },
            });
            messageId = result.messageId;
            sent += 1;
            sentForSchedule += 1;
          } catch (error) {
            failure = error;

            if (shouldDeactivateToken(error)) {
              await firebaseTokenRepository.deactivate(token.firebase_token_id);
            }
            break;
          }
        }
        if (failure) {
          failed += 1;
          await notificationScheduleRepository.markFailed(
            schedule.notification_send_schedule_id,
            `${failure instanceof Error ? failure.message : String(failure)} (sent ${sentForSchedule}/${tokens.length} tokens)`
          );
          continue;
        }
        await notificationScheduleRepository.markSent(
          schedule.notification_send_schedule_id,
          messageId
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
