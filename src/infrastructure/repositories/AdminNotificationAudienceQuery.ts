import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type { NotificationAudience } from '../../domain/entities/NotificationAudience';

export function buildAudienceStatusStatement(
  db: D1Database,
  audience: NotificationAudience
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

  if (audience.type === 'gathering') {
    return db
      .prepare(
        `SELECT
           EXISTS(
             SELECT 1 FROM gatherings WHERE gathering_id = ?
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
             WHERE ggm.gathering_id = ?
           ) AS active_token_count`
      )
      .bind(audience.gathering_id, audience.gathering_id);
  }

  if (audience.type === 'event_participants') {
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
               ON ggm.gathering_id = g.gathering_id
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

  if (audience.type === 'user') {
    return db
      .prepare(
        `SELECT
           EXISTS(
             SELECT 1 FROM users WHERE user_id = ?
           ) AS target_exists,
           (
             SELECT COUNT(DISTINCT ft.firebase_token_id)
             FROM users u
             INNER JOIN firebase_tokens ft
               ON ft.user_id = u.user_id
              AND ft.is_firebase_active = 1
             WHERE u.user_id = ?
               AND u.is_live_active = 1
           ) AS active_token_count`
      )
      .bind(audience.user_id, audience.user_id);
  }

  const userIds = [...new Set(audience.user_ids)];
  if (userIds.length === 0) {
    return db.prepare('SELECT 0 AS target_exists, 0 AS active_token_count');
  }
  const placeholders = createPlaceholders(userIds.length);
  return db
    .prepare(
      `SELECT
         CASE WHEN (
           SELECT COUNT(*)
           FROM users
           WHERE user_id IN (${placeholders})
         ) = ? THEN 1 ELSE 0 END AS target_exists,
         (
           SELECT COUNT(DISTINCT ft.firebase_token_id)
           FROM users u
           INNER JOIN firebase_tokens ft
             ON ft.user_id = u.user_id
            AND ft.is_firebase_active = 1
           WHERE u.user_id IN (${placeholders})
             AND u.is_live_active = 1
         ) AS active_token_count`
    )
    .bind(...userIds, userIds.length, ...userIds);
}

export function buildAudienceTokenSelect(audience: NotificationAudience): {
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

  if (audience.type === 'gathering') {
    return {
      sql: `SELECT DISTINCT ft.firebase_token_id
            FROM gathering_group_members ggm
            INNER JOIN users u
              ON u.user_id = ggm.user_id
             AND u.is_live_active = 1
            INNER JOIN firebase_tokens ft
              ON ft.user_id = ggm.user_id
             AND ft.is_firebase_active = 1
            WHERE ggm.gathering_id = ?`,
      bindings: [audience.gathering_id],
    };
  }

  if (audience.type === 'event_participants') {
    return {
      sql: `SELECT DISTINCT ft.firebase_token_id
            FROM gatherings g
            INNER JOIN gathering_group_members ggm
              ON ggm.gathering_id = g.gathering_id
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

  if (audience.type === 'user') {
    return {
      sql: `SELECT DISTINCT ft.firebase_token_id
            FROM users u
            INNER JOIN firebase_tokens ft
              ON ft.user_id = u.user_id
             AND ft.is_firebase_active = 1
            WHERE u.user_id = ?
              AND u.is_live_active = 1`,
      bindings: [audience.user_id],
    };
  }

  const userIds = [...new Set(audience.user_ids)];
  if (userIds.length === 0) {
    return { sql: 'SELECT NULL AS firebase_token_id WHERE 0', bindings: [] };
  }
  return {
    sql: `SELECT DISTINCT ft.firebase_token_id
          FROM users u
          INNER JOIN firebase_tokens ft
            ON ft.user_id = u.user_id
           AND ft.is_firebase_active = 1
          WHERE u.user_id IN (${createPlaceholders(userIds.length)})
            AND u.is_live_active = 1`,
    bindings: userIds,
  };
}

function createPlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
