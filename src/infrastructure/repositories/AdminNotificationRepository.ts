import type { D1Database, D1Result } from '@cloudflare/workers-types';
import type {
  CreateAdminNotificationInput,
  ManualNotificationAudienceStatus,
} from '../../domain/entities/AdminNotification';
import type { IAdminNotificationRepository } from '../../domain/interfaces/repositories/IAdminNotificationRepository';
import {
  buildAudienceStatusStatement,
  buildAudienceTokenSelect,
} from './AdminNotificationAudienceQuery';
import { shadowWriteNotificationAudiences } from './NotificationAudienceShadowWriter';

interface AudienceStatusRow {
  target_exists: number;
  active_token_count: number;
}

export function createAdminNotificationRepository(
  db: D1Database
): IAdminNotificationRepository {
  return {
    async getAudienceStatus(audience) {
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

      await shadowWriteNotificationAudiences(
        db,
        [{ notification_id: notificationId, audience: input.audience }],
        'manual'
      );

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

function getLastRowId(result: D1Result | undefined): number | null {
  if (!result || result.meta.changes === 0) return null;
  const value = result?.meta.last_row_id;
  return typeof value === 'number' && value > 0 ? value : null;
}
