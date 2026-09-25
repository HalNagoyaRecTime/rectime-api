import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0034_normalize_notification_datetime.sql'
  );
  if (!migration) {
    throw new Error(
      '0034_normalize_notification_datetime.sql is not registered'
    );
  }
  return migration.queries;
})();

const testPrefix = '0034通知日時移行テスト';

async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

describe('0034_normalize_notification_datetime.sql', () => {
  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM notification_schedules
       WHERE notification_id IN (
         SELECT notification_id FROM notifications
         WHERE title LIKE ?
       )`
    )
      .bind(`${testPrefix}%`)
      .run();
    await env.DB.prepare('DELETE FROM notifications WHERE title LIKE ?')
      .bind(`${testPrefix}%`)
      .run();
    await env.DB.prepare('DELETE FROM users WHERE user_name LIKE ?')
      .bind(`${testPrefix}%`)
      .run();
  });

  it('既存のSQLite日時とoffset付きISO日時をUTC ISOへ正規化する', async () => {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
    )
      .bind(`${testPrefix}利用者`)
      .first<{ user_id: number }>();
    if (!user) throw new Error('failed to create migration test user');

    await env.DB.prepare('PRAGMA ignore_check_constraints = ON').run();

    const notification = await env.DB.prepare(
      `INSERT INTO notifications (
         created_by_user_id, push_title, push_body, notification_type,
         title, body, importance, created_at, updated_at
       ) VALUES (?, 'push', 'body', 'notification_general', ?, 'detail',
         'normal', '2026-09-24 01:02:03', '2026-09-24T10:05:06+09:00')
       RETURNING notification_id`
    )
      .bind(user.user_id, `${testPrefix}通知`)
      .first<{ notification_id: number }>();
    if (!notification) throw new Error('failed to create migration notification');

    const token = await env.DB.prepare(
      `INSERT INTO firebase_tokens (
         user_id, platform, fcm_token, is_firebase_active,
         last_seen_at, created_at, updated_at
       ) VALUES (?, 2, '0034-datetime-token', 1,
         '2026-09-24T10:02:03+09:00',
         '2026-09-24 02:04:05',
         '2026-09-24T11:06:07+09:00')
       RETURNING firebase_token_id`
    )
      .bind(user.user_id)
      .first<{ firebase_token_id: number }>();
    if (!token) throw new Error('failed to create migration token');

    const schedule = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         created_user_id, scheduled_by_user_id, notification_id,
         firebase_token_id, importance, send_status, send_at,
         recipients_resolved_at, started_at, completed_at, stopped_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, 2, 'completed',
         '2026-09-24T12:34:56+09:00',
         '2026-09-24 03:00:00',
         '2026-09-24T12:01:02+09:00',
         '2026-09-24 03:10:11',
         NULL,
         '2026-09-24 02:10:11',
         '2026-09-24T11:12:13+09:00')
       RETURNING notification_schedule_id`
    )
      .bind(
        user.user_id,
        user.user_id,
        notification.notification_id,
        token.firebase_token_id
      )
      .first<{ notification_schedule_id: number }>();
    if (!schedule) throw new Error('failed to create migration schedule');

    const audience = await env.DB.prepare(
      `INSERT INTO notification_audiences (
         notification_schedule_id, audience_type, resolved_at,
         created_at, updated_at
       ) VALUES (?, 'all',
         '2026-09-24T12:02:03+09:00',
         '2026-09-24 02:20:21',
         '2026-09-24T11:22:23+09:00')
       RETURNING notification_audience_id`
    )
      .bind(schedule.notification_schedule_id)
      .first<{ notification_audience_id: number }>();
    if (!audience) throw new Error('failed to create migration audience');

    const recipient = await env.DB.prepare(
      `INSERT INTO notification_recipients (
         notification_schedule_id, user_id, created_at
       ) VALUES (?, ?, '2026-09-24 02:30:31')
       RETURNING notification_recipient_id`
    )
      .bind(schedule.notification_schedule_id, user.user_id)
      .first<{ notification_recipient_id: number }>();
    if (!recipient) throw new Error('failed to create migration recipient');

    const delivery = await env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_recipient_id, firebase_token_id, platform, status,
         attempt_count, first_attempt_at, last_attempt_at, next_retry_at,
         sent_at, created_at, updated_at
       ) VALUES (?, ?, 2, 'sent', 1,
         '2026-09-24 03:01:02',
         '2026-09-24T12:03:04+09:00',
         '2026-09-24 03:05:06',
         '2026-09-24T12:07:08+09:00',
         '2026-09-24 02:40:41',
         '2026-09-24T11:42:43+09:00')
       RETURNING notification_push_delivery_id`
    )
      .bind(recipient.notification_recipient_id, token.firebase_token_id)
      .first<{ notification_push_delivery_id: number }>();
    if (!delivery) throw new Error('failed to create migration delivery');

    await env.DB.prepare('PRAGMA ignore_check_constraints = OFF').run();

    await runMigration();

    const row = await env.DB.prepare(
      `SELECT
         n.created_at AS notification_created_at,
         n.updated_at AS notification_updated_at,
         ft.last_seen_at AS token_last_seen_at,
         ft.created_at AS token_created_at,
         ft.updated_at AS token_updated_at,
         ns.send_at AS schedule_send_at,
         ns.recipients_resolved_at AS schedule_resolved_at,
         ns.started_at AS schedule_started_at,
         ns.completed_at AS schedule_completed_at,
         ns.stopped_at AS schedule_stopped_at,
         ns.created_at AS schedule_created_at,
         ns.updated_at AS schedule_updated_at,
         na.resolved_at AS audience_resolved_at,
         na.created_at AS audience_created_at,
         na.updated_at AS audience_updated_at,
         nr.created_at AS recipient_created_at,
         npd.first_attempt_at AS delivery_first_attempt_at,
         npd.last_attempt_at AS delivery_last_attempt_at,
         npd.next_retry_at AS delivery_next_retry_at,
         npd.sent_at AS delivery_sent_at,
         npd.created_at AS delivery_created_at,
         npd.updated_at AS delivery_updated_at
       FROM notifications n
       INNER JOIN notification_schedules ns
         ON ns.notification_id = n.notification_id
       INNER JOIN firebase_tokens ft
         ON ft.firebase_token_id = ns.firebase_token_id
       INNER JOIN notification_audiences na
         ON na.notification_schedule_id = ns.notification_schedule_id
       INNER JOIN notification_recipients nr
         ON nr.notification_schedule_id = ns.notification_schedule_id
       INNER JOIN notification_push_deliveries npd
         ON npd.notification_recipient_id = nr.notification_recipient_id
       WHERE n.notification_id = ?`
    )
      .bind(notification.notification_id)
      .first<Record<string, string | null>>();

    expect(row).toEqual({
      notification_created_at: '2026-09-24T01:02:03.000Z',
      notification_updated_at: '2026-09-24T01:05:06.000Z',
      token_last_seen_at: '2026-09-24T01:02:03.000Z',
      token_created_at: '2026-09-24T02:04:05.000Z',
      token_updated_at: '2026-09-24T02:06:07.000Z',
      schedule_send_at: '2026-09-24T03:34:56.000Z',
      schedule_resolved_at: '2026-09-24T03:00:00.000Z',
      schedule_started_at: '2026-09-24T03:01:02.000Z',
      schedule_completed_at: '2026-09-24T03:10:11.000Z',
      schedule_stopped_at: null,
      schedule_created_at: '2026-09-24T02:10:11.000Z',
      schedule_updated_at: '2026-09-24T02:12:13.000Z',
      audience_resolved_at: '2026-09-24T03:02:03.000Z',
      audience_created_at: '2026-09-24T02:20:21.000Z',
      audience_updated_at: '2026-09-24T02:22:23.000Z',
      recipient_created_at: '2026-09-24T02:30:31.000Z',
      delivery_first_attempt_at: '2026-09-24T03:01:02.000Z',
      delivery_last_attempt_at: '2026-09-24T03:03:04.000Z',
      delivery_next_retry_at: '2026-09-24T03:05:06.000Z',
      delivery_sent_at: '2026-09-24T03:07:08.000Z',
      delivery_created_at: '2026-09-24T02:40:41.000Z',
      delivery_updated_at: '2026-09-24T02:42:43.000Z',
    });

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
