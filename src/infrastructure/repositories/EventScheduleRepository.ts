import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type { IEventScheduleRepository } from '../../domain/interfaces/repositories/IEventScheduleRepository';

export function createEventScheduleRepository(
  db: D1Database
): IEventScheduleRepository {
  return {
    async apply(input) {
      // 通知予定はグループ単位ではなく、グループに現在所属する
      // アクティブなFirebaseトークン単位（1トークン=1行）で管理する。
      const targetTokens = await db
        .prepare(
          `SELECT ft.firebase_token_id AS firebase_token_id
           FROM gathering_group_members gm
           INNER JOIN firebase_tokens ft ON ft.user_id = gm.user_id
           WHERE gm.gathering_group_id = ? AND ft.is_firebase_active = 1`
        )
        .bind(input.gathering_group_id)
        .all<{ firebase_token_id: number }>();
      const tokenIds = targetTokens.results.map(row => row.firebase_token_id);
      const tokenPlaceholders = tokenIds.map(() => '?').join(', ');

      const draftNotifications = tokenIds.length
        ? await db
            .prepare(
              `SELECT DISTINCT notification_id
               FROM notification_schedules
               WHERE event_id = ?
                 AND send_status = 'draft'
                 AND firebase_token_id IN (${tokenPlaceholders})`
            )
            .bind(input.event_id, ...tokenIds)
            .all<{ notification_id: number }>()
        : { results: [] as { notification_id: number }[] };
      const draftNotificationIds = draftNotifications.results.map(
        row => row.notification_id
      );

      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            `UPDATE events
             SET start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
             WHERE event_id = ?`
          )
          .bind(input.start_time, input.end_time, input.event_id),
      ];

      if (!input.notification_enabled || tokenIds.length === 0) {
        statements.push(
          db
            .prepare(
              `DELETE FROM notification_schedules
               WHERE event_id = ? AND send_status = 'draft'`
            )
            .bind(input.event_id)
        );
        appendOrphanNotificationCleanup(db, statements, draftNotificationIds);
        await db.batch(statements);
        return;
      }

      // グループを離れた/無効化されたトークン宛のdraftを整理する
      statements.push(
        db
          .prepare(
            `DELETE FROM notification_schedules
             WHERE event_id = ?
               AND send_status = 'draft'
               AND firebase_token_id NOT IN (${tokenPlaceholders})`
          )
          .bind(input.event_id, ...tokenIds)
      );

      statements.push(
        db
          .prepare(
            `UPDATE notifications
             SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP
             WHERE notification_id IN (
               SELECT notification_id
               FROM notification_schedules
               WHERE event_id = ?
                 AND send_status = 'draft'
                 AND firebase_token_id IN (${tokenPlaceholders})
             )`
          )
          .bind(
            input.notification_title,
            input.notification_body,
            input.event_id,
            ...tokenIds
          ),
        db
          .prepare(
            `INSERT INTO notifications (notification_type, title, body)
             SELECT 'event_reminder', ?, ?
             WHERE NOT EXISTS (
               SELECT 1
               FROM notification_schedules
               WHERE event_id = ?
                 AND send_status = 'draft'
                 AND firebase_token_id IN (${tokenPlaceholders})
             )`
          )
          .bind(
            input.notification_title,
            input.notification_body,
            input.event_id,
            ...tokenIds
          )
      );

      for (const tokenId of tokenIds) {
        statements.push(
          db
            .prepare(
              `INSERT INTO notification_schedules (
                 created_user_id,
                 event_id,
                 firebase_token_id,
                 notification_id,
                 importance,
                 send_status,
                 send_at
               )
               SELECT ?, ?, ?,
                 COALESCE(
                   (
                     SELECT notification_id
                     FROM notification_schedules
                     WHERE event_id = ?
                       AND send_status = 'draft'
                       AND firebase_token_id IN (${tokenPlaceholders})
                     LIMIT 1
                   ),
                   (SELECT notification_id FROM notifications ORDER BY notification_id DESC LIMIT 1)
                 ),
                 2, 'draft', ?
               WHERE NOT EXISTS (
                 SELECT 1
                 FROM notification_schedules
                 WHERE event_id = ?
                   AND firebase_token_id = ?
                   AND send_status = 'draft'
               )`
            )
            .bind(
              input.user_id,
              input.event_id,
              tokenId,
              input.event_id,
              ...tokenIds,
              input.send_at,
              input.event_id,
              tokenId
            )
        );
      }

      statements.push(
        db
          .prepare(
            `UPDATE notification_schedules
             SET send_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE event_id = ?
               AND send_status = 'draft'
               AND firebase_token_id IN (${tokenPlaceholders})`
          )
          .bind(input.send_at, input.event_id, ...tokenIds)
      );

      appendOrphanNotificationCleanup(db, statements, draftNotificationIds);

      await db.batch(statements);
    },
  };
}

function appendOrphanNotificationCleanup(
  db: D1Database,
  statements: D1PreparedStatement[],
  notificationIds: number[]
): void {
  if (notificationIds.length === 0) return;
  const placeholders = notificationIds.map(() => '?').join(', ');
  statements.push(
    db
      .prepare(
        `DELETE FROM notifications
         WHERE notification_id IN (${placeholders})
           AND notification_type = 'event_reminder'
           AND NOT EXISTS (
             SELECT 1
             FROM notification_schedules
             WHERE notification_schedules.notification_id = notifications.notification_id
           )`
      )
      .bind(...notificationIds)
  );
}
