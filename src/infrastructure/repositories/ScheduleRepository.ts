import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import {
  notification_schedules,
  users,
  events,
  firebase_tokens,
  gatherings,
  gathering_group_members,
} from '../database/schema';
import { eq, inArray, and } from 'drizzle-orm';

import type { D1Database } from '@cloudflare/workers-types';
import type { ScheduleUpdateEntity } from '../../domain/entities/Schedule';
import type { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';

export function createScheduleRepository(db: D1Database): IScheduleRepository {
  const orm = drizzle(db, { schema });
  return {
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
          eq(
            gathering_group_members.gatheringId,
            scheduleUpdate.new_gathering_id
          )
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
                scheduleUpdate.create_user_id,
                scheduleUpdate.new_event_id,
                notificationId,
                tokenId,
                scheduleUpdate.new_importance,
                scheduleUpdate.new_send_at
              )
          );
        }
      }

      await db.batch(statements);

      return scheduleUpdate;
    },
  };
}
