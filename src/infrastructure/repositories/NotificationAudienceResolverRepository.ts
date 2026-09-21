import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  INotificationAudienceResolverRepository,
  NotificationAudienceRecord,
  NotificationAudienceTarget,
} from '../../domain/interfaces/repositories/INotificationAudienceResolverRepository';
import type { NotificationAudienceType } from '../../domain/entities/NotificationV2';
import * as schema from '../database/schema';
import {
  notification_audiences,
  notification_recipients,
} from '../database/schema';

const RECIPIENT_INSERT_CHUNK_SIZE = 400;

type UserIdRow = {
  user_id: number;
};

export function createNotificationAudienceResolverRepository(
  db: D1Database
): INotificationAudienceResolverRepository {
  const orm = drizzle(db, { schema });

  return {
    async findDueScheduleIds(dueAt, limit) {
      const rows = await db
        .prepare(
          "SELECT notification_schedule_id AS id FROM notification_schedules WHERE send_status = 'scheduled' AND datetime(send_at) <= datetime(?) ORDER BY send_at, notification_schedule_id LIMIT ?"
        )
        .bind(dueAt, limit)
        .all<{ id: number }>();
      return rows.results.map(row => row.id);
    },

    async claimScheduleForResolution(scheduleId, dueAt) {
      const result = await db
        .prepare(
          "UPDATE notification_schedules SET send_status = 'resolving', started_at = ?, updated_at = ? WHERE notification_schedule_id = ? AND send_status = 'scheduled' AND datetime(send_at) <= datetime(?)"
        )
        .bind(dueAt, dueAt, scheduleId, dueAt)
        .run();
      return result.meta.changes === 1;
    },

    async isScheduleResolutionAllowed(scheduleId) {
      const row = await db
        .prepare(
          "SELECT 1 AS allowed FROM notification_schedules WHERE notification_schedule_id = ? AND send_status = 'resolving'"
        )
        .bind(scheduleId)
        .first<{ allowed: number }>();
      return row?.allowed === 1;
    },

    async findUnresolvedAudiences(scheduleId) {
      const rows = await orm
        .select({
          id: notification_audiences.id,
          scheduleId: notification_audiences.notificationScheduleId,
          audienceType: notification_audiences.audienceType,
          targetId: notification_audiences.targetId,
        })
        .from(notification_audiences)
        .where(
          and(
            eq(notification_audiences.notificationScheduleId, scheduleId),
            isNull(notification_audiences.resolvedAt)
          )
        )
        .orderBy(asc(notification_audiences.id))
        .all();

      return rows.map(row => ({
        ...row,
        audienceType: row.audienceType as NotificationAudienceType,
      })) as NotificationAudienceRecord[];
    },

    async findAudienceUserIds(audience) {
      const query = buildAudienceUserQuery(audience);
      const statement =
        query.bindings.length > 0
          ? db.prepare(query.sql).bind(...query.bindings)
          : db.prepare(query.sql);
      const result = await statement.all<UserIdRow>();
      return result.results.map(row => row.user_id);
    },

    async insertRecipients(scheduleId, userIds) {
      const uniqueUserIds = [...new Set(userIds)];
      for (
        let offset = 0;
        offset < uniqueUserIds.length;
        offset += RECIPIENT_INSERT_CHUNK_SIZE
      ) {
        const values = uniqueUserIds
          .slice(offset, offset + RECIPIENT_INSERT_CHUNK_SIZE)
          .map(userId => ({
            notificationScheduleId: scheduleId,
            userId,
          }));
        await orm
          .insert(notification_recipients)
          .values(values)
          .onConflictDoNothing({
            target: [
              notification_recipients.notificationScheduleId,
              notification_recipients.userId,
            ],
          })
          .run();
      }
    },

    async markAudienceResolved(audienceId, resolvedAt) {
      const result = await orm
        .update(notification_audiences)
        .set({ resolvedAt, updatedAt: resolvedAt })
        .where(
          and(
            eq(notification_audiences.id, audienceId),
            isNull(notification_audiences.resolvedAt)
          )
        )
        .run();
      return result.meta.changes === 1;
    },

    async markRecipientsResolved(scheduleId, resolvedAt) {
      const result = await db
        .prepare(
          "UPDATE notification_schedules SET recipients_resolved_at = ?, updated_at = ? WHERE notification_schedule_id = ? AND send_status = 'resolving' AND NOT EXISTS (SELECT 1 FROM notification_audiences WHERE notification_schedule_id = ? AND resolved_at IS NULL)"
        )
        .bind(resolvedAt, resolvedAt, scheduleId, scheduleId)
        .run();
      return result.meta.changes === 1;
    },
  };
}

function buildAudienceUserQuery(audience: NotificationAudienceTarget): {
  sql: string;
  bindings: number[];
} {
  switch (audience.audienceType) {
    case 'all':
      return {
        sql: 'SELECT user_id FROM users WHERE is_live_active = 1 ORDER BY user_id',
        bindings: [],
      };
    case 'class_room':
      return {
        sql: 'SELECT DISTINCT u.user_id FROM students s INNER JOIN users u ON u.user_id = s.user_id WHERE s.class_room_id = ? AND u.is_live_active = 1 ORDER BY u.user_id',
        bindings: [requireTargetId(audience)],
      };
    case 'gathering':
      return {
        sql: 'SELECT DISTINCT u.user_id FROM gathering_group_members ggm INNER JOIN users u ON u.user_id = ggm.user_id WHERE ggm.gathering_id = ? AND u.is_live_active = 1 ORDER BY u.user_id',
        bindings: [requireTargetId(audience)],
      };
    case 'event':
      return {
        sql: 'SELECT DISTINCT u.user_id FROM gatherings g INNER JOIN gathering_group_members ggm ON ggm.gathering_id = g.gathering_id INNER JOIN users u ON u.user_id = ggm.user_id WHERE g.event_id = ? AND u.is_live_active = 1 ORDER BY u.user_id',
        bindings: [requireTargetId(audience)],
      };
    case 'user':
      return {
        sql: 'SELECT user_id FROM users WHERE user_id = ? AND is_live_active = 1',
        bindings: [requireTargetId(audience)],
      };
  }
}

function requireTargetId(audience: NotificationAudienceTarget): number {
  if (audience.targetId == null) {
    throw new Error('Audience ' + audience.audienceType + ' requires targetId');
  }
  return audience.targetId;
}
