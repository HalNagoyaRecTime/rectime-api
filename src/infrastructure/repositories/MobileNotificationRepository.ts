import type { D1Database } from '@cloudflare/workers-types';
import {
  type SQL,
  and,
  asc,
  countDistinct,
  desc,
  eq,
  inArray,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  MobileNotificationEntity,
  MobileNotificationListOptions,
  MobileNotificationListResult,
  MobileNotificationRelatedEvent,
} from '../../domain/entities/MobileNotification';
import type { NotificationType } from '../../domain/entities/Notification';
import type { IMobileNotificationRepository } from '../../domain/interfaces/repositories/IMobileNotificationRepository';
import * as schema from '../database/schema';
import {
  events,
  event_venues,
  gatherings,
  notification_recipients,
  notification_schedules,
  notifications,
  venues,
} from '../database/schema';

const selection = {
  notification_id: notifications.notificationId,
  notification_type: notifications.notificationType,
  title: notifications.title,
  body: notifications.body,
  scheduled_at: notification_schedules.sendAt,
  related_event: {
    id: events.id,
    name: events.name,
    startTime: events.startTime,
    endTime: events.endTime,
  },
};

type MobileNotificationRow = {
  notification_id: number;
  notification_type: NotificationType;
  title: string;
  body: string;
  scheduled_at: string;
  related_event: Omit<MobileNotificationRelatedEvent, 'venues'> | null;
};

function toEntity(
  row: MobileNotificationRow,
  eventVenues: Map<number, MobileNotificationRelatedEvent['venues']>
): MobileNotificationEntity {
  return {
    id: row.notification_id,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    scheduledAt: row.scheduled_at,
    relatedEvent: row.related_event
      ? {
          ...row.related_event,
          venues: eventVenues.get(row.related_event.id) ?? [],
        }
      : null,
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

  const v2HistoryOnly = eq(
    notifications.notificationType,
    'notification_general'
  );

  // notificationsを起点にすると本人宛てでない通知まで1件ずつ確かめることになり、
  // 読み取り行数が通知の総数に比例するため、本人のRecipientを起点にする。
  const mine = (userId: number) =>
    and(eq(notification_recipients.userId, userId), v2HistoryOnly);

  // 本人Recipientがある最新Scheduleを選び、一覧・詳細をNotification単位で揃える。
  const historyQuery = (userId: number, condition?: SQL) =>
    orm
      .select(selection)
      .from(notification_recipients)
      .innerJoin(
        notification_schedules,
        eq(
          notification_schedules.id,
          notification_recipients.notificationScheduleId
        )
      )
      .innerJoin(
        notifications,
        eq(notifications.notificationId, notification_schedules.notificationId)
      )
      .leftJoin(
        gatherings,
        and(
          eq(notifications.sourceType, 'gathering'),
          eq(notifications.sourceId, gatherings.id)
        )
      )
      .leftJoin(events, eq(gatherings.eventId, events.id))
      .where(
        and(
          mine(userId),
          eq(
            notification_schedules.id,
            recipientSchedules(userId)
              .orderBy(
                desc(notification_schedules.sendAt),
                desc(notification_schedules.id)
              )
              .limit(1)
          ),
          condition
        )
      );

  // 会場を履歴QueryへJOINせず、ページ確定後に一括取得して件数・順序を維持する。
  async function withRelatedEvents(
    rows: MobileNotificationRow[]
  ): Promise<MobileNotificationEntity[]> {
    const eventIds = [
      ...new Set(
        rows.flatMap(row => (row.related_event ? [row.related_event.id] : []))
      ),
    ];
    const eventVenues = new Map<
      number,
      MobileNotificationRelatedEvent['venues']
    >();
    if (eventIds.length > 0) {
      const venueRows = await orm
        .select({
          eventId: event_venues.eventId,
          id: venues.id,
          name: venues.name,
        })
        .from(event_venues)
        .innerJoin(venues, eq(event_venues.venueId, venues.id))
        .where(inArray(event_venues.eventId, eventIds))
        .orderBy(asc(venues.id))
        .all();
      for (const venue of venueRows) {
        const items = eventVenues.get(venue.eventId) ?? [];
        items.push({ id: venue.id, name: venue.name });
        eventVenues.set(venue.eventId, items);
      }
    }
    return rows.map(row => toEntity(row, eventVenues));
  }

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
          .select({ total: countDistinct(notifications.notificationId) })
          .from(notification_recipients)
          .innerJoin(
            notification_schedules,
            eq(
              notification_schedules.id,
              notification_recipients.notificationScheduleId
            )
          )
          .innerJoin(
            notifications,
            eq(
              notifications.notificationId,
              notification_schedules.notificationId
            )
          )
          .where(mine(options.userId))
          .get(),
      ]);

      return {
        notifications: await withRelatedEvents(rows as MobileNotificationRow[]),
        total: totalResult?.total ?? 0,
      };
    },

    async findByIdForUser(notificationId, userId) {
      const row = await historyQuery(
        userId,
        eq(notifications.notificationId, notificationId)
      ).get();

      return row
        ? (await withRelatedEvents([row as MobileNotificationRow]))[0]
        : null;
    },
  };
}
