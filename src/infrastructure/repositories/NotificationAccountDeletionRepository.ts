import type { D1Database } from '@cloudflare/workers-types';
import { eq, or } from 'drizzle-orm';
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
          stoppedByUserId: null,
          updatedAt: now,
        })
        .where(
          or(
            eq(notification_schedules.scheduledByUserId, userId),
            eq(notification_schedules.stoppedByUserId, userId)
          )
        )
        .run();
    },
  };
}
