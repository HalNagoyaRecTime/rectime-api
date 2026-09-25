import type { D1Database } from '@cloudflare/workers-types';
import { and, count, desc, eq } from 'drizzle-orm';
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
  firebase_tokens,
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
  venue: events.venue,
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
  venue: string | null;
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
            venue: row.venue!,
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

  const baseConditions = (userId: number) =>
    and(
      eq(firebase_tokens.userId, userId),
      eq(notification_schedules.sendStatus, 'sent')
    );

  return {
    async findAllForUser(
      options: MobileNotificationListOptions
    ): Promise<MobileNotificationListResult> {
      const [rows, totalResult] = await Promise.all([
        orm
          .select(selection)
          .from(notification_schedules)
          .innerJoin(
            firebase_tokens,
            eq(
              notification_schedules.firebaseTokenId,
              firebase_tokens.firebaseTokenId
            )
          )
          .innerJoin(
            notifications,
            eq(
              notification_schedules.notificationId,
              notifications.notificationId
            )
          )
          .leftJoin(events, eq(notification_schedules.eventId, events.id))
          .where(baseConditions(options.userId))
          .orderBy(
            desc(notification_schedules.sendAt),
            desc(notification_schedules.id)
          )
          .limit(options.limit)
          .offset(options.offset)
          .all(),
        orm
          .select({ total: count() })
          .from(notification_schedules)
          .innerJoin(
            firebase_tokens,
            eq(
              notification_schedules.firebaseTokenId,
              firebase_tokens.firebaseTokenId
            )
          )
          .where(baseConditions(options.userId))
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
      const row = await orm
        .select(selection)
        .from(notification_schedules)
        .innerJoin(
          firebase_tokens,
          eq(
            notification_schedules.firebaseTokenId,
            firebase_tokens.firebaseTokenId
          )
        )
        .innerJoin(
          notifications,
          eq(
            notification_schedules.notificationId,
            notifications.notificationId
          )
        )
        .leftJoin(events, eq(notification_schedules.eventId, events.id))
        .where(
          and(
            baseConditions(userId),
            eq(notification_schedules.notificationId, notificationId)
          )
        )
        .orderBy(desc(notification_schedules.id))
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
