import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from '@cloudflare/workers-types';
import type {
  CreateAdminNotificationInput,
  ManualNotificationAudience,
  ManualNotificationAudienceStatus,
} from '../../domain/entities/AdminNotification';
import type { IAdminNotificationRepository } from '../../domain/interfaces/repositories/IAdminNotificationRepository';

interface AudienceStatusRow {
  target_exists: number;
  active_token_count: number;
}

export function createAdminNotificationRepository(
  db: D1Database
): IAdminNotificationRepository {
  return {
    async getAudienceStatus(audience) {
      if (audience.type === 'all') {
        const row = await db
          .prepare(
            `SELECT
               1 AS target_exists,
               COUNT(DISTINCT ft.firebase_token_id) AS active_token_count
             FROM firebase_tokens ft
             INNER JOIN users u ON u.user_id = ft.user_id
             WHERE ft.is_firebase_active = 1
               AND u.is_live_active = 1`
          )
          .first<AudienceStatusRow>();
        return toAudienceStatus(row);
      }

      const statement = buildAudienceStatusStatement(db, audience);
      return toAudienceStatus(await statement.first<AudienceStatusRow>());
    },

    async create(input) {
      const results = await db.batch([
        buildNotificationInsert(db, input),
        buildScheduleInsert(db, input),
      ]);

      const notificationId = getLastRowId(results[0]);
      const scheduleCount = results[1]?.meta.changes ?? 0;
      if (notificationId === null || scheduleCount === 0) {
        throw new Error('Failed to create manual notification');
      }

      return {
        notification_id: notificationId,
        notification_type: 'manual',
        title: input.title,
        body: input.body,
        audience: input.audience,
        scheduled_at: input.scheduled_at,
        schedule_count: scheduleCount,
        send_status: 'draft',
        importance: 2,
        created_user_id: input.created_user_id,
      };
    },
  };
}

function toAudienceStatus(
  row: AudienceStatusRow | null
): ManualNotificationAudienceStatus {
  return {
    exists: row?.target_exists === 1,
    active_token_count: row?.active_token_count ?? 0,
  };
}

function buildAudienceStatusStatement(
  db: D1Database,
  audience: Exclude<ManualNotificationAudience, { type: 'all' }>
): D1PreparedStatement {
  if (audience.type === 'class_room') {
    return db
      .prepare(
        `SELECT
           EXISTS(
             SELECT 1 FROM class_rooms WHERE class_room_id = ?
           ) AS target_exists,
           (
             SELECT COUNT(DISTINCT ft.firebase_token_id)
             FROM students s
             INNER JOIN users u
               ON u.user_id = s.user_id
              AND u.is_live_active = 1
             INNER JOIN firebase_tokens ft
               ON ft.user_id = s.user_id
              AND ft.is_firebase_active = 1
             WHERE s.class_room_id = ?
           ) AS active_token_count`
      )
      .bind(audience.class_room_id, audience.class_room_id);
  }

  if (audience.type === 'gathering_group') {
    return db
      .prepare(
        `SELECT
           EXISTS(
             SELECT 1 FROM gathering_groups WHERE gathering_group_id = ?
           ) AS target_exists,
           (
             SELECT COUNT(DISTINCT ft.firebase_token_id)
             FROM gathering_group_members ggm
             INNER JOIN users u
               ON u.user_id = ggm.user_id
              AND u.is_live_active = 1
             INNER JOIN firebase_tokens ft
               ON ft.user_id = ggm.user_id
              AND ft.is_firebase_active = 1
             WHERE ggm.gathering_group_id = ?
           ) AS active_token_count`
      )
      .bind(audience.gathering_group_id, audience.gathering_group_id);
  }

  return db
    .prepare(
      `SELECT
         EXISTS(
           SELECT 1 FROM events WHERE event_id = ?
         ) AS target_exists,
         (
           SELECT COUNT(DISTINCT ft.firebase_token_id)
           FROM gatherings g
           INNER JOIN gathering_group_members ggm
             ON ggm.gathering_group_id = g.gathering_group_id
           INNER JOIN users u
             ON u.user_id = ggm.user_id
            AND u.is_live_active = 1
           INNER JOIN firebase_tokens ft
             ON ft.user_id = ggm.user_id
            AND ft.is_firebase_active = 1
           WHERE g.event_id = ?
         ) AS active_token_count`
    )
    .bind(audience.event_id, audience.event_id);
}

function buildNotificationInsert(
  db: D1Database,
  input: CreateAdminNotificationInput
): D1PreparedStatement {
  const select = buildAudienceTokenSelect(input.audience);
  return db
    .prepare(
      `INSERT INTO notifications (notification_type, title, body)
       SELECT 'manual', ?, ?
       WHERE EXISTS (
         SELECT 1 FROM (${select.sql})
       )`
    )
    .bind(input.title, input.body, ...select.bindings);
}

function buildScheduleInsert(
  db: D1Database,
  input: CreateAdminNotificationInput
): D1PreparedStatement {
  const eventId =
    input.audience.type === 'event_participants'
      ? input.audience.event_id
      : null;
  const select = buildAudienceTokenSelect(input.audience);

  return db
    .prepare(
      `WITH target_notification AS MATERIALIZED (
         SELECT last_insert_rowid() AS notification_id
       )
       INSERT INTO notification_schedules (
         created_user_id,
         event_id,
         notification_id,
         firebase_token_id,
         importance,
         send_status,
         send_at
       )
       SELECT
         ?,
         ?,
         target_notification.notification_id,
         audience.firebase_token_id,
         2,
         'draft',
         ?
       FROM target_notification
       CROSS JOIN (${select.sql}) audience`
    )
    .bind(
      input.created_user_id,
      eventId,
      input.scheduled_at,
      ...select.bindings
    );
}

function buildAudienceTokenSelect(audience: ManualNotificationAudience): {
  sql: string;
  bindings: number[];
} {
  if (audience.type === 'all') {
    return {
      sql: `SELECT DISTINCT ft.firebase_token_id
            FROM firebase_tokens ft
            INNER JOIN users u
              ON u.user_id = ft.user_id
             AND u.is_live_active = 1
            WHERE ft.is_firebase_active = 1`,
      bindings: [],
    };
  }

  if (audience.type === 'class_room') {
    return {
      sql: `SELECT DISTINCT ft.firebase_token_id
            FROM students s
            INNER JOIN users u
              ON u.user_id = s.user_id
             AND u.is_live_active = 1
            INNER JOIN firebase_tokens ft
              ON ft.user_id = s.user_id
             AND ft.is_firebase_active = 1
            WHERE s.class_room_id = ?`,
      bindings: [audience.class_room_id],
    };
  }

  if (audience.type === 'gathering_group') {
    return {
      sql: `SELECT DISTINCT ft.firebase_token_id
            FROM gathering_group_members ggm
            INNER JOIN users u
              ON u.user_id = ggm.user_id
             AND u.is_live_active = 1
            INNER JOIN firebase_tokens ft
              ON ft.user_id = ggm.user_id
             AND ft.is_firebase_active = 1
            WHERE ggm.gathering_group_id = ?`,
      bindings: [audience.gathering_group_id],
    };
  }

  return {
    sql: `SELECT DISTINCT ft.firebase_token_id
          FROM gatherings g
          INNER JOIN gathering_group_members ggm
            ON ggm.gathering_group_id = g.gathering_group_id
          INNER JOIN users u
            ON u.user_id = ggm.user_id
           AND u.is_live_active = 1
          INNER JOIN firebase_tokens ft
            ON ft.user_id = ggm.user_id
           AND ft.is_firebase_active = 1
          WHERE g.event_id = ?`,
    bindings: [audience.event_id],
  };
}

function getLastRowId(result: D1Result | undefined): number | null {
  if (!result || result.meta.changes === 0) return null;
  const value = result?.meta.last_row_id;
  return typeof value === 'number' && value > 0 ? value : null;
}
