import type { D1Database } from '@cloudflare/workers-types';
import { and, count, desc, eq, exists } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  MobileNotificationEntity,
  MobileNotificationListOptions,
  MobileNotificationListResult,
} from '../../domain/entities/MobileNotification';
import type { IMobileNotificationRepository } from '../../domain/interfaces/repositories/IMobileNotificationRepository';
import type { EventVenueEntity } from '../../domain/entities/Event';
import * as schema from '../database/schema';
import {
  events,
  notification_recipients,
  notification_schedules,
  notifications,
} from '../database/schema';
import { findVenuesByEventIds } from './eventVenues';

const selection = {
  notification_id: notifications.notificationId,
  notification_type: notifications.notificationType,
  title: notifications.title,
  body: notifications.body,
  scheduled_at: notification_schedules.sendAt,
  event_id: events.id,
  event_name: events.name,
  start_time: events.startTime,
  end_time: events.endTime,
};

type MobileNotificationRow = {
  notification_id: number;
  notification_type: string;
  title: string;
  body: string;
  scheduled_at: string;
  event_id: number | null;
  event_name: string | null;
  start_time: string | null;
  end_time: string | null;
};

function toEntity(
  row: MobileNotificationRow,
  venuesByEventId: Map<number, EventVenueEntity[]>
): MobileNotificationEntity {
  return {
    id: row.notification_id,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    scheduledAt: row.scheduled_at,
    relatedEvent:
      row.event_id === null
        ? null
        : {
            id: row.event_id,
            name: row.event_name!,
            venues: venuesByEventId.get(row.event_id) ?? [],
            startTime: row.start_time!,
            endTime: row.end_time!,
          },
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
      )
      .leftJoin(events, eq(notification_schedules.eventId, events.id));

  return {
    async findAllForUser(
      options: MobileNotificationListOptions
    ): Promise<MobileNotificationListResult> {
      const [rows, totalResult] = await Promise.all([
        historyQuery(options.userId)
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
          .where(exists(recipientSchedules(options.userId)))
          .get(),
      ]);

      const notificationRows = rows as MobileNotificationRow[];
      const venuesByEventId = await findVenuesByEventIds(
        orm,
        notificationRows
          .map(row => row.event_id)
          .filter((eventId): eventId is number => eventId !== null)
      );

      return {
        notifications: notificationRows.map(row =>
          toEntity(row, venuesByEventId)
        ),
        total: totalResult?.total ?? 0,
      };
    },

    async findByIdForUser(notificationId, userId) {
      const row = await historyQuery(userId)
        .where(eq(notifications.notificationId, notificationId))
        .get();

      if (!row) return null;
      const notificationRow = row as MobileNotificationRow;
      const venuesByEventId = await findVenuesByEventIds(
        orm,
        notificationRow.event_id === null ? [] : [notificationRow.event_id]
      );
      return toEntity(notificationRow, venuesByEventId);
    },
  };
}
