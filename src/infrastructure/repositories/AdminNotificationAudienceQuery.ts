import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type { ManualNotificationAudience } from '../../domain/entities/AdminNotification';

export function buildAudienceStatusStatement(
  db: D1Database,
  audience: ManualNotificationAudience
): D1PreparedStatement {
  if (audience.type === 'all') {
    return db.prepare(
      `SELECT
         1 AS target_exists,
         COUNT(DISTINCT ft.firebase_token_id) AS active_token_count
       FROM firebase_tokens ft
       INNER JOIN users u ON u.user_id = ft.user_id
       WHERE ft.is_firebase_active = 1
         AND u.is_live_active = 1`
    );
  }

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

export function buildAudienceTokenSelect(
  audience: ManualNotificationAudience
): {
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
