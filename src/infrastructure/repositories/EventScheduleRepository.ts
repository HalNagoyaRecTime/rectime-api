import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from '@cloudflare/workers-types';
import type { NotificationAudienceShadowWriteInput } from '../../domain/entities/NotificationAudience';
import type { IEventScheduleRepository } from '../../domain/interfaces/repositories/IEventScheduleRepository';
import { shadowWriteNotificationAudiences } from './NotificationAudienceShadowWriter';

interface EventAudienceRow {
  gathering_id: number;
  gathering_spot_name: string;
}

interface NotificationSummaryRow {
  scheduled_at: string | null;
  total: number;
  draft: number;
  sending: number;
  sent: number;
  failed: number;
}

export function createEventScheduleRepository(
  db: D1Database
): IEventScheduleRepository {
  return {
    async apply(input) {
      const updateMarker = createUpdateMarker();
      const audience =
        input.refresh_notifications && input.notification_enabled
          ? await db
              .prepare(
                `SELECT DISTINCT
                 g.gathering_id,
                 gs.gathering_spot_name
               FROM gatherings g
               INNER JOIN gathering_spots gs
                 ON gs.gathering_spot_id = g.gathering_spot_id
               WHERE g.event_id = ?
                 AND EXISTS (
                   SELECT 1
                   FROM gathering_group_members ggm
                   INNER JOIN users u
                     ON u.user_id = ggm.user_id
                   INNER JOIN firebase_tokens ft
                     ON ft.user_id = u.user_id
                    AND ft.is_firebase_active = 1
                   WHERE ggm.gathering_id = g.gathering_id
                 )
               ORDER BY g.gathering_id`
              )
              .bind(input.event_id)
              .all<EventAudienceRow>()
          : { results: [] as EventAudienceRow[] };

      const statements: D1PreparedStatement[] = [
        buildEventUpdate(db, input, updateMarker),
      ];
      const notificationShadowWrites: Array<{
        resultIndex: number;
        audience: NotificationAudienceShadowWriteInput['audience'];
      }> = [];

      if (input.refresh_notifications) {
        statements.push(
          db
            .prepare(
              `DELETE FROM notification_schedules
             WHERE event_id = ?
               AND send_status = 'draft'
               AND notification_id IN (
                 SELECT notification_id
                 FROM notifications
                 WHERE notification_type = 'event_reminder'
               )
               AND EXISTS (
                 SELECT 1
                 FROM events
                 WHERE event_id = ?
                   AND updated_at = ?
               )`
            )
            .bind(input.event_id, input.event_id, updateMarker)
        );
      }

      if (input.refresh_notifications && input.notification_enabled) {
        if (!input.send_at) {
          throw new Error('Notification send_at is required');
        }
        for (const row of audience.results) {
          const resultIndex = statements.length;
          statements.push(
            buildNotificationInsert(
              db,
              input,
              row.gathering_spot_name,
              updateMarker
            ),
            buildScheduleInsert(
              db,
              input,
              row.gathering_id,
              input.send_at,
              updateMarker
            )
          );
          notificationShadowWrites.push({
            resultIndex,
            audience: {
              type: 'gathering',
              gathering_id: row.gathering_id,
            },
          });
        }
      }
      if (input.refresh_notifications) {
        statements.push(
          buildOrphanNotificationCleanup(db, input.event_id, updateMarker)
        );
      }

      const results = await db.batch(statements);
      const [updateResult] = results;
      if (Number(updateResult.meta.changes ?? 0) === 0) {
        throw new Error('Event update conflict');
      }

      const shadowWriteInputs = notificationShadowWrites.map(write => ({
        notification_id: getLastRowId(results[write.resultIndex]),
        audience: write.audience,
      }));
      if (shadowWriteInputs.some(input => input.notification_id === null)) {
        console.error(
          '[NOTIFICATION_AUDIENCE] Shadow Write用の通知IDを取得できませんでした',
          {
            source: 'event',
            audienceCount: shadowWriteInputs.length,
          }
        );
      } else {
        await shadowWriteNotificationAudiences(
          db,
          shadowWriteInputs as NotificationAudienceShadowWriteInput[],
          'event'
        );
      }
    },

    async getNotificationSummary(eventId) {
      const summary = await db
        .prepare(
          `SELECT
             COALESCE(
               MAX(CASE
                 WHEN ns.send_status IN ('draft', 'sending') THEN ns.send_at
               END),
               MAX(ns.send_at)
             ) AS scheduled_at,
             COUNT(*) AS total,
             SUM(CASE WHEN ns.send_status = 'draft' THEN 1 ELSE 0 END) AS draft,
             SUM(CASE WHEN ns.send_status = 'sending' THEN 1 ELSE 0 END) AS sending,
             SUM(CASE WHEN ns.send_status = 'sent' THEN 1 ELSE 0 END) AS sent,
             SUM(CASE WHEN ns.send_status = 'failed' THEN 1 ELSE 0 END) AS failed
           FROM notification_schedules ns
           INNER JOIN notifications n
             ON n.notification_id = ns.notification_id
           WHERE ns.event_id = ?
             AND n.notification_type = 'event_reminder'`
        )
        .bind(eventId)
        .first<NotificationSummaryRow>();

      return {
        scheduled_at: summary?.scheduled_at ?? null,
        total: Number(summary?.total ?? 0),
        draft: Number(summary?.draft ?? 0),
        sending: Number(summary?.sending ?? 0),
        sent: Number(summary?.sent ?? 0),
        failed: Number(summary?.failed ?? 0),
      };
    },
  };
}

function buildEventUpdate(
  db: D1Database,
  input: Parameters<IEventScheduleRepository['apply']>[0],
  updateMarker: string
): D1PreparedStatement {
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  const add = (column: string, value: string | null | undefined) => {
    if (value === undefined) return;
    assignments.push(`${column} = ?`);
    values.push(value);
  };

  add('event_name', input.event_name);
  add('rule_text', input.rule_text);
  add('venue', input.venue);
  add('start_time', input.start_time);
  add('end_time', input.end_time);
  assignments.push('updated_at = ?');
  values.push(updateMarker);
  values.push(
    input.event_id,
    input.expected_event.event_name,
    input.expected_event.rule_text,
    input.expected_event.venue,
    input.expected_event.start_time,
    input.expected_event.end_time,
    input.expected_event.updated_at
  );

  return db
    .prepare(
      `UPDATE events
       SET ${assignments.join(', ')}
       WHERE event_id = ?
         AND event_name = ?
         AND rule_text IS ?
         AND venue = ?
         AND start_time = ?
         AND end_time = ?
         AND updated_at = ?`
    )
    .bind(...values);
}

function buildNotificationInsert(
  db: D1Database,
  input: Parameters<IEventScheduleRepository['apply']>[0],
  gatheringSpotName: string,
  updateMarker: string
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO notifications (notification_type, title, body)
       SELECT
         'event_reminder',
         event_name || '開始のお知らせ',
         event_name || 'の開始時間が近づいています。該当チームは' || ? || 'へ集合してください。'
       FROM events
       WHERE event_id = ?
         AND updated_at = ?`
    )
    .bind(gatheringSpotName, input.event_id, updateMarker);
}

function buildScheduleInsert(
  db: D1Database,
  input: Parameters<IEventScheduleRepository['apply']>[0],
  gatheringId: number,
  sendAt: string,
  updateMarker: string
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO notification_schedules (
         created_user_id,
         event_id,
         notification_id,
         firebase_token_id,
         importance,
         send_status,
         send_at
       )
       SELECT DISTINCT
         ?,
         ?,
         last_insert_rowid(),
         ft.firebase_token_id,
         2,
         'draft',
         ?
       FROM gathering_group_members ggm
       INNER JOIN users u
         ON u.user_id = ggm.user_id
       INNER JOIN firebase_tokens ft
         ON ft.user_id = u.user_id
        AND ft.is_firebase_active = 1
       WHERE ggm.gathering_id = ?
         AND EXISTS (
           SELECT 1
           FROM events
           WHERE event_id = ?
             AND updated_at = ?
         )`
    )
    .bind(
      input.user_id,
      input.event_id,
      sendAt,
      gatheringId,
      input.event_id,
      updateMarker
    );
}

function buildOrphanNotificationCleanup(
  db: D1Database,
  eventId: number,
  updateMarker: string
): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM notifications
     WHERE notification_type = 'event_reminder'
       AND NOT EXISTS (
         SELECT 1
         FROM notification_schedules
         WHERE notification_schedules.notification_id = notifications.notification_id
       )
       AND EXISTS (
         SELECT 1
         FROM events
         WHERE event_id = ?
           AND updated_at = ?
       )`
    )
    .bind(eventId, updateMarker);
}

function createUpdateMarker(): string {
  const iso = new Date().toISOString();
  const random = crypto.getRandomValues(new Uint8Array(3));
  const suffix = (
    (((random[0] ?? 0) << 16) | ((random[1] ?? 0) << 8) | (random[2] ?? 0)) %
    1_000_000
  )
    .toString()
    .padStart(6, '0');
  return `${iso.slice(0, -1)}${suffix}Z`;
}

function getLastRowId(result: D1Result | undefined): number | null {
  if (!result || result.meta.changes === 0) return null;
  const value = result.meta.last_row_id;
  return typeof value === 'number' && value > 0 ? value : null;
}
