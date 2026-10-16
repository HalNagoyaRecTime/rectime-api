import type { D1Database } from '@cloudflare/workers-types';
import type { NotificationAudienceType } from '../../domain/entities/Notification';
import type { NotificationAudienceTarget } from '../../domain/entities/AdminNotificationCommand';

export interface AudienceUserSelect {
  sql: string;
  params: number[];
}

export type AudienceTargetAvailabilityMode = 'target-exists' | 'resolver';

// Resolverとaudience-countで同じ対象User条件を使う。
const ACTIVE_USER_CONDITION =
  "u.is_live_active = 1 AND u.deletion_status = 'active'";

const TARGET_TABLE_BY_TYPE: Record<
  Exclude<NotificationAudienceType, 'all'>,
  { table: string; idColumn: string }
> = {
  class_room: { table: 'class_rooms', idColumn: 'class_room_id' },
  gathering: { table: 'gatherings', idColumn: 'gathering_id' },
  event: { table: 'events', idColumn: 'event_id' },
  user: { table: 'users', idColumn: 'user_id' },
};

/** Audienceの対象User IDを返すSELECT文を組み立てる */
export function buildAudienceUserSelect(
  target: NotificationAudienceTarget
): AudienceUserSelect {
  switch (target.type) {
    case 'all':
      return {
        sql: `SELECT u.user_id FROM users u WHERE ${ACTIVE_USER_CONDITION}`,
        params: [],
      };
    case 'class_room':
      return {
        sql:
          'SELECT u.user_id FROM students student ' +
          'JOIN users u ON u.user_id = student.user_id ' +
          `WHERE ${ACTIVE_USER_CONDITION} AND student.class_room_id = ?`,
        params: [target.target_id],
      };
    case 'gathering':
      return {
        sql:
          'SELECT u.user_id FROM gathering_group_members member ' +
          'JOIN users u ON u.user_id = member.user_id ' +
          `WHERE ${ACTIVE_USER_CONDITION} AND member.gathering_id = ?`,
        params: [target.target_id],
      };
    case 'event':
      return {
        sql:
          'SELECT DISTINCT u.user_id FROM gatherings g ' +
          'JOIN gathering_group_members member ON member.gathering_id = g.gathering_id ' +
          'JOIN users u ON u.user_id = member.user_id ' +
          `WHERE ${ACTIVE_USER_CONDITION} AND g.event_id = ?`,
        params: [target.target_id],
      };
    case 'user':
      return {
        sql: `SELECT u.user_id FROM users u WHERE ${ACTIVE_USER_CONDITION} AND u.user_id = ?`,
        params: [target.target_id],
      };
  }
}

/** Audienceの対象がすべて存在するか確認する */
export async function areAudienceTargetsAvailable(
  db: D1Database,
  targets: NotificationAudienceTarget[],
  mode: AudienceTargetAvailabilityMode = 'target-exists'
): Promise<boolean> {
  for (const target of targets) {
    if (target.type === 'all') continue;
    const { table, idColumn } = TARGET_TABLE_BY_TYPE[target.type];
    const userMustBeActive =
      mode === 'resolver' && target.type === 'user'
        ? " AND deletion_status = 'active'"
        : '';
    const row = await db
      .prepare(
        `SELECT EXISTS (
           SELECT 1 FROM ${table}
           WHERE ${idColumn} = ?${userMustBeActive}
         ) AS target_exists`
      )
      .bind(target.target_id)
      .first<{ target_exists: number }>();
    if (row?.target_exists !== 1) return false;
  }
  return true;
}
