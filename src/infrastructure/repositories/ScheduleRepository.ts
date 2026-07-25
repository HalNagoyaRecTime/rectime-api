import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import {
  notification_schedules,
  users,
  events,
  notifications,
  firebase_tokens,
} from '../database/schema';
import { sql, eq } from 'drizzle-orm';

import type { D1Database } from '@cloudflare/workers-types';
import type { ScheduleEntity } from '../../domain/entities/Schedule';
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

function toEntity(row: ScheduleRow): ScheduleEntity {
  return {
    schedules: [
      {
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
      },
    ],
  };
}

export function createScheduleRepository(db: D1Database): IScheduleRepository {
  const orm = drizzle(db, { schema });
  return {
    async findAll(): Promise<ScheduleEntity[]> {
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
          draft_deliveries: sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'draft' then 1 end) as signed)`,
          sending_deliveries: sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'sending' then 1 end) as signed)`,
          sent_deliveries: sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'sent' then 1 end) as signed)`,
          failed_deliveries: sql<number>`cast(count(case when ${notification_schedules.sendStatus} = 'failed' then 1 end) as signed)`,
          total_deliveries: sql<number>`cast(count(*) as signed)`,
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

      return result.map(toEntity);
    },
  };
}
