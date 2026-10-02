import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import {
  NOTIFICATION_AUDIENCE_TYPES,
  type NotificationAudienceType,
} from '../../domain/entities/Notification';
import {
  NOTIFICATION_AUDIENCE_TARGET_MISSING_REASON,
  UnresolvableNotificationAudienceError,
  type UnresolvedNotificationAudience,
} from '../../domain/entities/NotificationAudienceResolver';
import type { NotificationAudienceTarget } from '../../domain/entities/AdminNotificationCommand';
import type { INotificationAudienceResolverRepository } from '../../domain/interfaces/repositories/INotificationAudienceResolverRepository';
import {
  areAudienceTargetsAvailable,
  buildAudienceUserSelect,
} from './NotificationAudienceUserQuery';

interface CandidateRow {
  notification_schedule_id: number;
  send_status: string;
}

interface AudienceRow {
  notification_audience_id: number;
  audience_type: string;
  target_id: number | null;
}

interface CountRow {
  recipient_count: number;
}

export function createNotificationAudienceResolverRepository(
  db: D1Database
): INotificationAudienceResolverRepository {
  return {
    async findDueCandidates(now, limit) {
      const rows = await db
        .prepare(
          `SELECT s.notification_schedule_id, s.send_status
           FROM notification_schedules s
           JOIN notifications n ON n.notification_id = s.notification_id
           WHERE n.notification_type = 'notification_general'
             AND s.recipients_resolved_at IS NULL
             AND datetime(s.send_at) <= datetime(?)
             AND s.send_status IN ('scheduled', 'resolving')
           ORDER BY s.send_at, s.notification_schedule_id
           LIMIT ?`
        )
        .bind(now, limit)
        .all<CandidateRow>();
      return rows.results.map(row => ({
        notification_schedule_id: row.notification_schedule_id,
        send_status: row.send_status as 'scheduled' | 'resolving',
      }));
    },

    async claimScheduled(scheduleId, now) {
      const result = await db
        .prepare(
          `UPDATE notification_schedules
           SET send_status = 'resolving',
               started_at = COALESCE(started_at, ?),
               updated_at = ?
           WHERE notification_schedule_id = ?
             AND send_status = 'scheduled'
             AND datetime(send_at) <= datetime(?)
             AND recipients_resolved_at IS NULL
             AND EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.notification_id = notification_schedules.notification_id
                 AND n.notification_type = 'notification_general'
             )`
        )
        .bind(now, now, scheduleId, now)
        .run();
      return result.meta.changes === 1;
    },

    async findUnresolvedAudiences(scheduleId) {
      const rows = await db
        .prepare(
          `SELECT a.notification_audience_id, a.audience_type, a.target_id
           FROM notification_audiences a
           JOIN notification_schedules s
             ON s.notification_schedule_id = a.notification_schedule_id
           WHERE a.notification_schedule_id = ?
             AND a.resolved_at IS NULL
             AND s.send_status = 'resolving'
             AND s.recipients_resolved_at IS NULL
           ORDER BY a.notification_audience_id`
        )
        .bind(scheduleId)
        .all<AudienceRow>();
      return rows.results.map(row => ({
        notification_audience_id: row.notification_audience_id,
        audience_type: assertAudienceType(
          row.audience_type,
          row.notification_audience_id
        ),
        target_id: row.target_id,
      }));
    },

    async resolveAudience(scheduleId, audience, now) {
      // 対象消失は空Audienceとして確定せず、ServiceでScheduleをfailedにする。
      if (
        !(await areAudienceTargetsAvailable(db, [toAudienceTarget(audience)]))
      ) {
        throw new UnresolvableNotificationAudienceError(
          audience.notification_audience_id,
          `${NOTIFICATION_AUDIENCE_TARGET_MISSING_REASON} (Audience ${audience.notification_audience_id}, ${audience.audience_type}: ${audience.target_id})`
        );
      }
      const insert = buildRecipientInsert(db, scheduleId, audience, now);
      const markResolved = db
        .prepare(
          `UPDATE notification_audiences
           SET resolved_at = ?, updated_at = ?
           WHERE notification_audience_id = ?
             AND notification_schedule_id = ?
             AND audience_type = ?
             AND target_id IS ?
             AND resolved_at IS NULL
             AND EXISTS (
               SELECT 1 FROM notification_schedules s
               WHERE s.notification_schedule_id = ?
                 AND s.send_status = 'resolving'
                 AND s.recipients_resolved_at IS NULL
             )`
        )
        .bind(
          now,
          now,
          audience.notification_audience_id,
          scheduleId,
          audience.audience_type,
          audience.target_id,
          scheduleId
        );

      await db.batch([insert, markResolved]);
    },

    async failSchedule(scheduleId, reason, now) {
      const result = await db
        .prepare(
          `UPDATE notification_schedules
           SET send_status = 'failed', reason = ?, updated_at = ?
           WHERE notification_schedule_id = ?
             AND send_status = 'resolving'
             AND recipients_resolved_at IS NULL`
        )
        .bind(reason, now, scheduleId)
        .run();
      return result.meta.changes === 1;
    },

    async isScheduleRetryable(scheduleId) {
      const row = await db
        .prepare(
          `SELECT 1
           FROM notification_schedules
           WHERE notification_schedule_id = ?
             AND send_status IN ('scheduled', 'resolving')
             AND recipients_resolved_at IS NULL`
        )
        .bind(scheduleId)
        .first();
      return row !== null;
    },

    async completeScheduleIfResolved(scheduleId, now) {
      const result = await db
        .prepare(
          `UPDATE notification_schedules
           SET recipients_resolved_at = ?, updated_at = ?
           WHERE notification_schedule_id = ?
             AND send_status = 'resolving'
             AND recipients_resolved_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM notification_audiences a
               WHERE a.notification_schedule_id = ?
                 AND a.resolved_at IS NULL
             )`
        )
        .bind(now, now, scheduleId, scheduleId)
        .run();
      return result.meta.changes === 1;
    },

    async countRecipients(scheduleId) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS recipient_count
           FROM notification_recipients
           WHERE notification_schedule_id = ?`
        )
        .bind(scheduleId)
        .first<CountRow>();
      return row?.recipient_count ?? 0;
    },
  };
}

function buildRecipientInsert(
  db: D1Database,
  scheduleId: number,
  audience: UnresolvedNotificationAudience,
  now: string
): D1PreparedStatement {
  const users = buildAudienceUserSelect(toAudienceTarget(audience));
  return db
    .prepare(
      `INSERT INTO notification_recipients (
         notification_schedule_id, user_id, created_at
       )
       SELECT ?, audience_users.user_id, ?
       FROM (${users.sql}) AS audience_users
       WHERE EXISTS (
         SELECT 1
         FROM notification_audiences a
         JOIN notification_schedules s
           ON s.notification_schedule_id = a.notification_schedule_id
         WHERE a.notification_audience_id = ?
           AND a.notification_schedule_id = ?
           AND a.audience_type = ?
           AND a.target_id IS ?
           AND a.resolved_at IS NULL
           AND s.send_status = 'resolving'
           AND s.recipients_resolved_at IS NULL
       )
       ON CONFLICT(notification_schedule_id, user_id) DO NOTHING`
    )
    .bind(
      scheduleId,
      now,
      ...users.params,
      audience.notification_audience_id,
      scheduleId,
      audience.audience_type,
      audience.target_id
    );
}

function toAudienceTarget(
  audience: UnresolvedNotificationAudience
): NotificationAudienceTarget {
  switch (audience.audience_type) {
    case 'all':
      return { type: 'all', target_id: null };
    case 'class_room':
    case 'gathering':
    case 'event':
    case 'user':
      return {
        type: audience.audience_type,
        target_id: requireTargetId(audience),
      };
    default:
      throw new UnresolvableNotificationAudienceError(
        audience.notification_audience_id,
        `Audience ${audience.notification_audience_id} の種別がサポートされていません`
      );
  }
}

function assertAudienceType(
  value: string,
  audienceId: number
): NotificationAudienceType {
  if (
    !NOTIFICATION_AUDIENCE_TYPES.includes(value as NotificationAudienceType)
  ) {
    throw new UnresolvableNotificationAudienceError(
      audienceId,
      `Audience ${audienceId} の種別がサポートされていません`
    );
  }
  return value as NotificationAudienceType;
}

function requireTargetId(audience: UnresolvedNotificationAudience): number {
  if (audience.target_id === null) {
    throw new UnresolvableNotificationAudienceError(
      audience.notification_audience_id,
      `Audience ${audience.notification_audience_id} に対象IDがありません`
    );
  }
  return audience.target_id;
}
