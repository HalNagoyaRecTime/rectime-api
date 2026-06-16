import { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { INotificationSendLogRepository } from '../../domain/interfaces/repositories/INotificationSendLogRepository';
import { IFcmService } from '../../application/services/IFcmService';
import { IScheduledNotificationService } from '../../application/services/IScheduledNotificationService';

export function createScheduledNotificationService(deps: {
  eventRepository: IEventRepository;
  firebaseTokenRepository: IFirebaseTokenRepository;
  notificationSendLogRepository: INotificationSendLogRepository;
  fcmService: IFcmService;
}): IScheduledNotificationService {
  const {
    eventRepository,
    firebaseTokenRepository,
    notificationSendLogRepository,
    fcmService,
  } = deps;

  return {
    async sendScheduledEventNotifications(now = new Date()) {
      const targetTime = getJstHmm(addMinutes(now, 10));
      const today = getJstDate(now);
      const { events } = await eventRepository.findAll({ time: targetTime });
      const tokens = await firebaseTokenRepository.findActiveTokens();
      let sent = 0;
      let failed = 0;

      for (const event of events) {
        for (const token of tokens) {
          const alreadySent =
            await notificationSendLogRepository.hasAlreadySent({
              eventId: event.f_event_id,
              firebaseTokenId: token.id,
              scheduledForDate: today,
            });

          if (alreadySent) {
            continue;
          }

          try {
            const result = await fcmService.sendNotificationToToken({
              token: token.fcm_token,
              title: '呼び出し通知',
              body: `${event.f_event_name}の開始10分前です。${event.f_place}に集合してください。`,
              data: {
                type: 'event_reminder',
                eventId: String(event.f_event_id),
              },
            });

            await notificationSendLogRepository.record({
              eventId: event.f_event_id,
              firebaseTokenId: token.id,
              scheduledForDate: today,
              messageId: result.messageId,
            });
            sent += 1;
          } catch (error) {
            failed += 1;

            if (shouldDeactivateToken(error)) {
              await firebaseTokenRepository.deactivate(token.id);
            }

            console.error('Failed to send scheduled notification', error);
          }
        }
      }

      return {
        checkedEvents: events.length,
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

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getJstHmm(date: Date): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date).replace(':', '');
}

function getJstDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}
