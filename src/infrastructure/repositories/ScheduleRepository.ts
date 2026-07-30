import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { ScheduleWriteDTO } from '../../application/dto/ScheduleDTO';
import {
  notification_schedules,
  users,
  events,
  notifications,
  firebase_tokens,
  gatherings,
  gathering_group_members,
} from '../database/schema';
import { sql, eq, inArray } from 'drizzle-orm';

import type { D1Database } from '@cloudflare/workers-types';
import type {
  ScheduleEntity,
  NotificationSchedule,
  ScheduleWriteEntity,
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

    async createSchedule(
      schedule: ScheduleWriteDTO
    ): Promise<ScheduleWriteEntity> {
      const targetEventId = schedule.event_id ?? null;

      if (!targetEventId) {
        throw new Error('Event ID is required to create a schedule.');
      }

      const eventIdExists = await orm
        .select({ user_id: users.id })
        .from(gatherings)
        .leftJoin(
          gathering_group_members,
          eq(gatherings.id, gathering_group_members.gatheringId)
        )
        .leftJoin(events, eq(gatherings.eventId, events.id))
        .leftJoin(users, eq(gathering_group_members.userId, users.id))
        .where(eq(events.id, targetEventId))
        .all();

      const userIds = eventIdExists
        .map(row => row.user_id)
        .filter((id): id is number => id !== null);

      const tokenRows = await orm
        .select({ firebase_token_id: firebase_tokens.firebaseTokenId })
        .from(firebase_tokens)
        .where(inArray(firebase_tokens.userId, userIds))
        .all();

      const firebaseTokenIds = tokenRows
        .map(row => row.firebase_token_id)
        .filter((token): token is number => typeof token !== 'string');

      const insertPayloads = tokenRows.map(row => ({
        createdUserId: schedule.user_id,
        eventId: schedule.event_id,
        notificationId: schedule.notification_id,
        firebaseTokenId: row.firebase_token_id,
        sendStatus: 'draft',
        fcmMessageId: null,
        importance: schedule.importance,
        sendAt: schedule.send_at,
      }));

      await orm
        .insert(notification_schedules)
        .values(insertPayloads)
        .returning({ id: notification_schedules.id })
        .all();

      return {
        user_id: schedule.user_id,
        event_id: targetEventId,
        notification_id: schedule.notification_id,
        firebase_token_id: firebaseTokenIds[0] ?? 0,
        importance: schedule.importance,
        send_at: schedule.send_at,
      };
    },
  };
}
