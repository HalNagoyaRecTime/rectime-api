import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0044_add_notification_recipient_updated_at.sql'
  );
  if (!migration) {
    throw new Error(
      '0044_add_notification_recipient_updated_at.sql is not registered'
    );
  }
  return migration.queries;
})();

const testPrefix = '0044RecipientUpdatedAt';

describe('0044_add_notification_recipient_updated_at.sql', () => {
  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM notification_schedules
       WHERE notification_id IN (
         SELECT notification_id FROM notifications WHERE title = ?
       )`
    )
      .bind(testPrefix)
      .run();
    await env.DB.prepare('DELETE FROM notifications WHERE title = ?')
      .bind(testPrefix)
      .run();
    await env.DB.prepare('DELETE FROM users WHERE user_name = ?')
      .bind(testPrefix)
      .run();
  });

  it('既存Recipientのupdated_atをcreated_atで初期化する', async () => {
    await env.DB.prepare(
      'ALTER TABLE notification_recipients DROP COLUMN updated_at'
    ).run();

    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(testPrefix)
      .first<{ user_id: number }>();
    if (!user) throw new Error('Migration test user could not be created');

    const notification = await env.DB.prepare(
      `INSERT INTO notifications (
         notification_type, push_title, push_body, title, body
       ) VALUES ('notification_general', 'push', 'body', ?, 'body')
       RETURNING notification_id`
    )
      .bind(testPrefix)
      .first<{ notification_id: number }>();
    if (!notification) {
      throw new Error('Migration test notification could not be created');
    }

    const schedule = await env.DB.prepare(
      `INSERT INTO notification_schedules (notification_id, send_status, send_at)
       VALUES (?, 'sent', '2026-10-01T00:00:00.000Z')
       RETURNING notification_schedule_id`
    )
      .bind(notification.notification_id)
      .first<{ notification_schedule_id: number }>();
    if (!schedule) throw new Error('Migration test schedule could not be created');

    const createdAt = '2026-10-01T00:01:00.000Z';
    const recipient = await env.DB.prepare(
      `INSERT INTO notification_recipients (
         notification_schedule_id, user_id, created_at
       ) VALUES (?, ?, ?)
       RETURNING notification_recipient_id`
    )
      .bind(schedule.notification_schedule_id, user.user_id, createdAt)
      .first<{ notification_recipient_id: number }>();
    if (!recipient) throw new Error('Migration test recipient could not be created');

    await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));

    const updated = await env.DB.prepare(
      `SELECT created_at, updated_at
       FROM notification_recipients
       WHERE notification_recipient_id = ?`
    )
      .bind(recipient.notification_recipient_id)
      .first<{ created_at: string; updated_at: string | null }>();

    expect(updated).toEqual({ created_at: createdAt, updated_at: createdAt });
  });
});
