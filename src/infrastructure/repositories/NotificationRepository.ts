import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { NotificationEntity } from '../../domain/entities/Notification';
import type { INotificationRepository } from '../../domain/interfaces/repositories/INotificationRepository';
import * as schema from '../database/schema';
import { notifications } from '../database/schema';

function toEntity(row: typeof notifications.$inferSelect): NotificationEntity {
  return {
    notification_id: row.notificationId,
    notification_type: row.notificationType,
    title: row.title,
    body: row.body,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createNotificationRepository(
  db: D1Database
): INotificationRepository {
  const orm = drizzle(db, { schema });

  return {
    async create(input) {
      const row = await orm
        .insert(notifications)
        .values({
          notificationType: input.notification_type,
          title: input.title,
          body: input.body,
        })
        .returning()
        .get();
      if (!row) throw new Error('Failed to create notification');
      return toEntity(row);
    },

    async findAll(options) {
      const conditions: SQL[] = [];
      if (options.notification_type) {
        conditions.push(
          eq(notifications.notificationType, options.notification_type)
        );
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, totalResult] = await Promise.all([
        orm
          .select()
          .from(notifications)
          .where(where)
          .orderBy(asc(notifications.notificationId))
          .limit(options.limit)
          .offset(options.offset)
          .all(),
        orm.select({ total: count() }).from(notifications).where(where).get(),
      ]);

      return {
        items: rows.map(toEntity),
        total: totalResult?.total ?? 0,
      };
    },

    async findById(notificationId) {
      const row = await orm
        .select()
        .from(notifications)
        .where(eq(notifications.notificationId, notificationId))
        .get();
      return row ? toEntity(row) : null;
    },

    async update(notificationId, input) {
      const row = await orm
        .update(notifications)
        .set({
          ...input,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(notifications.notificationId, notificationId))
        .returning()
        .get();
      return row ? toEntity(row) : null;
    },
  };
}
