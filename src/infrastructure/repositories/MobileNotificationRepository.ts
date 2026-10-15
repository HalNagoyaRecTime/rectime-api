import type { D1Database } from '@cloudflare/workers-types';
import { and, count, desc, eq, exists } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  MobileNotificationEntity,
  MobileNotificationListOptions,
  MobileNotificationListResult,
} from '../../domain/entities/MobileNotification';
import type { NotificationType } from '../../domain/entities/Notification';
import type { IMobileNotificationRepository } from '../../domain/interfaces/repositories/IMobileNotificationRepository';
import * as schema from '../database/schema';
import {
  notification_recipients,
  notification_schedules,
  notifications,
} from '../database/schema';

const selection = {
  notification_id: notifications.notificationId,
  notification_type: notifications.notificationType,
  title: notifications.title,
  body: notifications.body,
  scheduled_at: notification_schedules.sendAt,
};

type MobileNotificationRow = {
  notification_id: number;
  notification_type: NotificationType;
  title: string;
  body: string;
  scheduled_at: string;
};

function toEntity(row: MobileNotificationRow): MobileNotificationEntity {
  return {
    id: row.notification_id,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    scheduledAt: row.scheduled_at,
  };
}

export function createMobileNotificationRepository(
  db: D1Database
): IMobileNotificationRepository {
  const orm = drizzle(db, { schema });

  // user_idの一致だけで本人判定し、匿名化Recipientや配送状態には依存しない。
  const recipientSchedules = (userId: number) =>
    orm
      .select({ id: notification_schedules.id })
      .from(notification_recipients)
      .innerJoin(
        notification_schedules,
        eq(
          notification_recipients.notificationScheduleId,
          notification_schedules.id
        )
      )
      .where(
        and(
          eq(notification_recipients.userId, userId),
          eq(
            notification_schedules.notificationId,
            notifications.notificationId
          )
        )
      );

  // 本人Recipientがある最新Scheduleを選び、一覧・詳細をNotification単位で揃える。
  const historyQuery = (userId: number) =>
    orm
      .select(selection)
      .from(notifications)
      .innerJoin(
        notification_schedules,
        eq(
          notification_schedules.id,
          recipientSchedules(userId)
            .orderBy(
              desc(notification_schedules.sendAt),
              desc(notification_schedules.id)
            )
            .limit(1)
        )
      );

  const v2HistoryOnly = eq(
    notifications.notificationType,
    'notification_general'
  );

  return {
    async findAllForUser(
      options: MobileNotificationListOptions
    ): Promise<MobileNotificationListResult> {
      const [rows, totalResult] = await Promise.all([
        historyQuery(options.userId)
          .where(v2HistoryOnly)
          .orderBy(
            desc(notification_schedules.sendAt),
            desc(notification_schedules.id)
          )
          .limit(options.limit)
          .offset(options.offset)
          .all(),
        orm
          .select({ total: count() })
          .from(notifications)
          .where(and(v2HistoryOnly, exists(recipientSchedules(options.userId))))
          .get(),
      ]);

      return {
        notifications: (rows as MobileNotificationRow[]).map(toEntity),
        total: totalResult?.total ?? 0,
      };
    },

    async findByIdForUser(notificationId, userId) {
      const row = await historyQuery(userId)
        .where(
          and(eq(notifications.notificationId, notificationId), v2HistoryOnly)
        )
        .get();

      return row ? toEntity(row as MobileNotificationRow) : null;
    },
  };
}
