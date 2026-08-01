import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import {
  notification_schedules,
  users,
  events,
  notifications,
  firebase_tokens,
  gatherings,
  gathering_group_members,
} from '../database/schema';
import { sql, eq, inArray, and } from 'drizzle-orm';

import type { D1Database } from '@cloudflare/workers-types';
import type {
  ScheduleEntity,
  NotificationSchedule,
  ScheduleUpdateEntity,
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

    async updateSchedule(
      notificationId: number,
      scheduleUpdate: ScheduleUpdateEntity
    ): Promise<ScheduleUpdateEntity> {
      const checkSchedules = await orm
        .select({ send_status: notification_schedules.sendStatus })
        .from(notification_schedules)
        .where(eq(notification_schedules.notificationId, notificationId))
        .all();

      if (checkSchedules.some(s => s.send_status !== 'draft')) {
        throw new Error('Only schedules with "draft" status can be updated.');
      }

      const userIdsRow = await orm
        .select({ user_id: users.id })
        .from(gatherings)
        .leftJoin(
          gathering_group_members,
          eq(gatherings.id, gathering_group_members.gatheringId)
        )
        .leftJoin(events, eq(gatherings.eventId, events.id))
        .leftJoin(users, eq(gathering_group_members.userId, users.id))
        .where(
          eq(gathering_group_members.gatheringId, scheduleUpdate.NewGatheringId)
        )
        .all();

      const userIds = userIdsRow
        .map(row => row.user_id)
        .filter((id): id is number => id !== null);

      const tokenRows = await orm
        .select({ firebase_token_id: firebase_tokens.firebaseTokenId })
        .from(firebase_tokens)
        .innerJoin(users, eq(firebase_tokens.userId, users.id))
        .where(
          and(
            inArray(firebase_tokens.userId, userIds),
            eq(firebase_tokens.isFirebaseActive, 1),
            eq(users.isLiveActive, 1)
          )
        )
        .all();

      const firebaseTokenIds = tokenRows
        .map(row => row.firebase_token_id)
        .filter(
          (token): token is number => token !== null && token !== undefined
        );

      const statements = [
        db
          .prepare(
            'DELETE FROM notification_schedules WHERE notification_id = ? and send_status = "draft"'
          )
          .bind(notificationId),
      ];

      if (firebaseTokenIds.length > 0) {
        for (const tokenId of firebaseTokenIds) {
          statements.push(
            db
              .prepare(
                `INSERT INTO notification_schedules (
                   created_user_id,
                   event_id,
                   notification_id,
                   firebase_token_id,
                   send_status,
                   fcm_message_id,
                   importance,
                   send_at
                 ) VALUES (?, ?, ?, ?, 'draft', NULL, ?, ?)`
              )
              .bind(
                scheduleUpdate.CreateUserId,
                scheduleUpdate.NewEventId,
                notificationId,
                tokenId,
                scheduleUpdate.NewImportance,
                scheduleUpdate.NewSendAt
              )
          );
        }
      }

      await db.batch(statements);

      return scheduleUpdate;
    },
  };
}
