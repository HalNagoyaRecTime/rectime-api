import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import {
  notification_schedules,
  users,
  events,
  notifications,
  firebase_tokens,
} from '../database/schema';
import { sql, eq, and } from 'drizzle-orm';

import type { D1Database } from '@cloudflare/workers-types';
import type {
  ScheduleEntity,
  ScheduleHistoryEntity,
  NotificationSchedule,
  // ScheduleDeleteResponse,
  historyNotificationSchedule,
} from '../../domain/entities/Schedule';
import type { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';

type ScheduleRow = {
  notification_id: number;
  notification_type: string | null;
  title: string | null;
  body: string | null;
  created_user_id: number | null;
  created_user_name: string | null;
  event_id: number | null;
  event_name: string | null;
  start_time: string | null;
  end_time: string | null;
  send_time: string;
  total_deliveries: number;
  draft_deliveries: number;
  sending_deliveries: number;
  sent_deliveries: number;
  failed_deliveries: number;
};

type HistoryScheduleRow = {
  notification_id: number;
  notification_type: string | null;
  title: string | null;
  body: string | null;
  send_time: string;
  event_id: number | null;
  event_name: string | null;
};

function toNotificationSchedule(row: ScheduleRow): NotificationSchedule {
  return {
    notification_id: row.notification_id,
    notification_type: row.notification_type ?? '',
    title: row.title ?? '',
    body: row.body ?? '',
    created_user: {
      user_id: row.created_user_id ?? 0,
      user_name: row.created_user_name ?? '',
    },
    event: {
      event_id: row.event_id ?? 0,
      event_name: row.event_name ?? '',
      start_time: row.start_time ?? '',
      end_time: row.end_time ?? '',
    },
    send_time: row.send_time,
    delivery_summary: {
      total: row.total_deliveries,
      draft: row.draft_deliveries,
      sending: row.sending_deliveries,
      sent: row.sent_deliveries,
      failed: row.failed_deliveries,
    },
  };
}

function toHistoryNotificationSchedule(
  row: HistoryScheduleRow
): historyNotificationSchedule {
  return {
    notification_id: row.notification_id,
    notification_type: row.notification_type ?? '',
    title: row.title ?? '',
    body: row.body ?? '',
    send_time: row.send_time,
    event: {
      event_id: row.event_id ?? 0,
      event_name: row.event_name ?? '',
    },
  };
}

export function createScheduleRepository(db: D1Database): IScheduleRepository {
  const orm = drizzle(db, { schema });
  return {
    async findAll(): Promise<ScheduleEntity> {
      const result = await orm
        .select({
          notification_id: notification_schedules.notificationId,
          notification_type: notifications.notificationType,
          title: notifications.title,
          body: notifications.body,
          created_user_id: users.id,
          created_user_name: users.userName,
          event_id: events.id,
          event_name: events.name,
          start_time: events.startTime,
          end_time: events.endTime,
          send_time: notification_schedules.sendAt,
          draft_deliveries:
            sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'draft' then 1 end) as signed)`.mapWith(
              Number
            ),
          sending_deliveries:
            sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'sending' then 1 end) as signed)`.mapWith(
              Number
            ),
          sent_deliveries:
            sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'sent' then 1 end) as signed)`.mapWith(
              Number
            ),
          failed_deliveries:
            sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'failed' then 1 end) as signed)`.mapWith(
              Number
            ),
          total_deliveries: sql<number>`cast(count(*) as signed)`.mapWith(
            Number
          ),
        })
        .from(notification_schedules)
        .leftJoin(users, eq(notification_schedules.createdUserId, users.id))
        .leftJoin(events, eq(notification_schedules.eventId, events.id))
        .leftJoin(
          notifications,
          eq(
            notification_schedules.notificationId,
            notifications.notificationId
          )
        )
        .leftJoin(
          firebase_tokens,
          eq(
            notification_schedules.firebaseTokenId,
            firebase_tokens.firebaseTokenId
          )
        )
        .groupBy(
          notification_schedules.notificationId,
          notifications.notificationType,
          notifications.title,
          notifications.body,
          users.id,
          users.userName,
          events.id,
          events.name,
          events.startTime,
          events.endTime,
          notification_schedules.sendAt
        )
        .all();

      return {
        notification_schedules: result.map(toNotificationSchedule),
      };
    },

    async findById(id: number): Promise<ScheduleEntity | null> {
      const result = await orm
        .select({
          notification_id: notification_schedules.notificationId,
          notification_type: notifications.notificationType,
          title: notifications.title,
          body: notifications.body,
          created_user_id: users.id,
          created_user_name: users.userName,
          event_id: events.id,
          event_name: events.name,
          start_time: events.startTime,
          end_time: events.endTime,
          send_time: notification_schedules.sendAt,
          draft_deliveries:
            sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'draft' then 1 end) as signed)`.mapWith(
              Number
            ),
          sending_deliveries:
            sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'sending' then 1 end) as signed)`.mapWith(
              Number
            ),
          sent_deliveries:
            sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'sent' then 1 end) as signed)`.mapWith(
              Number
            ),
          failed_deliveries:
            sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'failed' then 1 end) as signed)`.mapWith(
              Number
            ),
          total_deliveries: sql<number>`cast(count(*) as signed)`.mapWith(
            Number
          ),
        })
        .from(notification_schedules)
        .leftJoin(users, eq(notification_schedules.createdUserId, users.id))
        .leftJoin(events, eq(notification_schedules.eventId, events.id))
        .leftJoin(
          notifications,
          eq(
            notification_schedules.notificationId,
            notifications.notificationId
          )
        )
        .leftJoin(
          firebase_tokens,
          eq(
            notification_schedules.firebaseTokenId,
            firebase_tokens.firebaseTokenId
          )
        )
        .where(eq(notification_schedules.notificationId, id))
        .groupBy(
          notification_schedules.notificationId,
          notifications.notificationType,
          notifications.title,
          notifications.body,
          users.id,
          users.userName,
          events.id,
          events.name,
          events.startTime,
          events.endTime,
          notification_schedules.sendAt
        )
        .get();

      return result
        ? { notification_schedules: [toNotificationSchedule(result)] }
        : null;
    },

    // async deleteById(id: number): Promise<void> {
    //   const result = await orm
    //     .delete(notification_schedules)
    //     .where(
    //       and(
    //         eq(notification_schedules.notificationId, id),
    //         eq(notification_schedules.sendStatus, 'draft')
    //       )
    //     )
    //     .returning({});
    // },

    async findByUserId(user_id: number): Promise<ScheduleHistoryEntity | null> {
      const firebaseTokenExists = await orm
        .select({ id: firebase_tokens.firebaseTokenId })
        .from(firebase_tokens)
        .where(eq(firebase_tokens.userId, user_id))
        .get();

      if (!firebaseTokenExists) {
        return null;
      }

      const result = await orm
        .select({
          notification_id: notification_schedules.notificationId,
          notification_type: notifications.notificationType,
          title: notifications.title,
          body: notifications.body,
          send_time: notification_schedules.sendAt,
          event_id: events.id,
          event_name: events.name,
        })
        .from(notification_schedules)
        .leftJoin(users, eq(notification_schedules.createdUserId, users.id))
        .leftJoin(events, eq(notification_schedules.eventId, events.id))
        .leftJoin(
          notifications,
          eq(
            notification_schedules.notificationId,
            notifications.notificationId
          )
        )
        .leftJoin(
          firebase_tokens,
          eq(
            notification_schedules.firebaseTokenId,
            firebase_tokens.firebaseTokenId
          )
        )
        .where(
          and(
            eq(notification_schedules.firebaseTokenId, firebaseTokenExists?.id),
            eq(notification_schedules.sendStatus, 'sent')
          )
        )
        .orderBy(sql`datetime(${notification_schedules.sendAt}) DESC`)
        .all();

      return result
        ? { notifications: result.map(toHistoryNotificationSchedule) }
        : null;
    },
  };
}
