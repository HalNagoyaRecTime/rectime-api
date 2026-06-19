import { D1Database } from '@cloudflare/workers-types';
import { INotificationSendLogRepository } from '../../domain/interfaces/repositories/INotificationSendLogRepository';

export function createNotificationSendLogRepository(
  db: D1Database
): INotificationSendLogRepository {
  return {
    async hasAlreadySent(input: {
      eventId: number;
      firebaseTokenId: number;
      scheduledForDate: string;
    }): Promise<boolean> {
      const result = await db
        .prepare(
          `
          SELECT id
          FROM notification_send_logs
          WHERE event_id = ?
            AND firebase_token_id = ?
            AND notification_type = 'event_reminder_10min'
            AND scheduled_for_date = ?
          `
        )
        .bind(input.eventId, input.firebaseTokenId, input.scheduledForDate)
        .first();

      return Boolean(result);
    },

    async record(input: {
      eventId: number;
      firebaseTokenId: number;
      scheduledForDate: string;
      messageId: string;
    }): Promise<void> {
      await db
        .prepare(
          `
          INSERT INTO notification_send_logs (
            event_id,
            firebase_token_id,
            notification_type,
            scheduled_for_date,
            fcm_message_id
          )
          VALUES (?, ?, 'event_reminder_10min', ?, ?)
          `
        )
        .bind(
          input.eventId,
          input.firebaseTokenId,
          input.scheduledForDate,
          input.messageId
        )
        .run();
    },
  };
}
