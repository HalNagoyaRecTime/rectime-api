import { NOTIFICATION_AUDIENCE_USER_DELETED_REASON } from '../../domain/entities/NotificationAudienceResolver';
import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { INotificationAccountDeletionRepository } from '../../domain/interfaces/repositories/INotificationAccountDeletionRepository';
import { notificationUtcNow } from '../database/notificationDateTime';
import * as schema from '../database/schema';
import {
  notification_recipients,
  notification_schedules,
  notifications,
} from '../database/schema';

export function createNotificationAccountDeletionRepository(
  db: D1Database
): INotificationAccountDeletionRepository {
  const orm = drizzle(db, { schema });

  return {
    async deleteDirectUserAudiencesByUserId(userId) {
      const now = notificationUtcNow();
      // 対象消失の記録とAudience削除を同じトランザクションで行う。
      await db.batch([
        db
          .prepare(
            `UPDATE notification_schedules
           SET send_status = 'failed', reason = ?, updated_at = ?
           WHERE send_status IN ('scheduled', 'resolving')
             AND recipients_resolved_at IS NULL
             AND EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.notification_id = notification_schedules.notification_id
                 AND n.notification_type = 'notification_general'
             )
             AND EXISTS (
               SELECT 1 FROM notification_audiences a
               WHERE a.notification_schedule_id = notification_schedules.notification_schedule_id
                 AND a.audience_type = 'user' AND a.target_id = ?
             )`
          )
          .bind(NOTIFICATION_AUDIENCE_USER_DELETED_REASON, now, userId),
        db
          .prepare(
            "DELETE FROM notification_audiences WHERE audience_type = 'user' AND target_id = ?"
          )
          .bind(userId),
      ]);
    },

    async deleteRecipientsByUserId(userId) {
      await orm
        .delete(notification_recipients)
        .where(eq(notification_recipients.userId, userId))
        .run();
    },

    async anonymizeV2ActorReferences(userId) {
      const now = notificationUtcNow();
      await orm
        .update(notifications)
        .set({
          createdByUserId: null,
          updatedAt: now,
        })
        .where(eq(notifications.createdByUserId, userId))
        .run();

      await orm
        .update(notification_schedules)
        .set({
          scheduledByUserId: null,
          updatedAt: now,
        })
        .where(eq(notification_schedules.scheduledByUserId, userId))
        .run();

      await orm
        .update(notification_schedules)
        .set({
          stoppedByUserId: null,
          updatedAt: now,
        })
        .where(eq(notification_schedules.stoppedByUserId, userId))
        .run();
    },
  };
}
