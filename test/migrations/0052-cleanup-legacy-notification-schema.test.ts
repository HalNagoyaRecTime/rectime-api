import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0052_cleanup_legacy_notification_schema.sql'
  );
  if (!migration) {
    throw new Error(
      '0052_cleanup_legacy_notification_schema.sql is not registered'
    );
  }
  return migration.queries;
})();

const testPrefix = '0052通知スキーマ整理テスト';

// 0052適用時点の旧列を、0052適用後の現行スキーマへ復元する。
async function addLegacyColumns(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      'ALTER TABLE firebase_tokens ADD COLUMN is_firebase_active INTEGER NOT NULL DEFAULT 1'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_schedules ADD COLUMN created_user_id INTEGER'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_schedules ADD COLUMN event_id INTEGER'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_schedules ADD COLUMN firebase_token_id INTEGER'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_schedules ADD COLUMN importance INTEGER NOT NULL DEFAULT 2'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_schedules ADD COLUMN fcm_message_id TEXT'
    ),
  ]);
}

async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

describe('0052_cleanup_legacy_notification_schema.sql', () => {
  beforeAll(addLegacyColumns);

  it('旧Scheduleと無効Tokenを削除し、v2のSchedule・Token・Deliveryを保持する', async () => {
    const userId = 994801;
    const notificationId = 994802;
    const activeTokenId = 994811;
    const inactiveTokenId = 994812;
    const legacyActiveScheduleId = 994821;
    const legacyInactiveScheduleId = 994822;
    const v2ScheduleId = 994823;
    const legacyRecipientId = 994831;
    const v2RecipientId = 994832;
    const activeDeliveryId = 994841;
    const inactiveDeliveryId = 994842;
    const legacyDeliveryId = 994843;

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO users (user_id, user_name) VALUES (?, ?)'
      ).bind(userId, `${testPrefix}利用者`),
      env.DB.prepare(
        `INSERT INTO notifications (
           notification_id, push_title, push_body, notification_type, title, body
         ) VALUES (?, 'push', 'body', 'notification_general', ?, 'detail')`
      ).bind(notificationId, `${testPrefix}通知`),
      env.DB.prepare(
        `INSERT INTO firebase_tokens (
           firebase_token_id, user_id, platform, fcm_token, is_firebase_active
         ) VALUES (?, ?, 1, '0052-active-token', 1)`
      ).bind(activeTokenId, userId),
      env.DB.prepare(
        `INSERT INTO firebase_tokens (
           firebase_token_id, user_id, platform, fcm_token, is_firebase_active
         ) VALUES (?, ?, 2, '0052-inactive-token', 0)`
      ).bind(inactiveTokenId, userId),
      env.DB.prepare(
        `INSERT INTO notification_schedules (
           notification_schedule_id, created_user_id, notification_id,
           firebase_token_id, importance, send_status, fcm_message_id, send_at
         ) VALUES (?, ?, ?, ?, 3, 'scheduled', 'legacy-message',
                   '2099-01-01T00:00:00.000Z')`
      ).bind(
        legacyActiveScheduleId,
        userId,
        notificationId,
        activeTokenId
      ),
      env.DB.prepare(
        `INSERT INTO notification_schedules (
           notification_schedule_id, created_user_id, notification_id,
           firebase_token_id, importance, send_status, fcm_message_id, send_at
         ) VALUES (?, ?, ?, ?, 2, 'scheduled', 'legacy-message',
                   '2099-01-02T00:00:00.000Z')`
      ).bind(
        legacyInactiveScheduleId,
        userId,
        notificationId,
        inactiveTokenId
      ),
      env.DB.prepare(
        `INSERT INTO notification_schedules (
           notification_schedule_id, notification_id, send_status, send_at
         ) VALUES (?, ?, 'scheduled', '2099-01-03T00:00:00.000Z')`
      ).bind(v2ScheduleId, notificationId),
      env.DB.prepare(
        `INSERT INTO notification_recipients (
           notification_recipient_id, notification_schedule_id, user_id
         ) VALUES (?, ?, ?)`
      ).bind(legacyRecipientId, legacyActiveScheduleId, userId),
      env.DB.prepare(
        `INSERT INTO notification_recipients (
           notification_recipient_id, notification_schedule_id, user_id
         ) VALUES (?, ?, ?)`
      ).bind(v2RecipientId, v2ScheduleId, userId),
      env.DB.prepare(
        `INSERT INTO notification_push_deliveries (
           notification_push_delivery_id, notification_recipient_id,
           firebase_token_id, platform, status
         ) VALUES (?, ?, ?, 1, 'sent')`
      ).bind(activeDeliveryId, v2RecipientId, activeTokenId),
      env.DB.prepare(
        `INSERT INTO notification_push_deliveries (
           notification_push_delivery_id, notification_recipient_id,
           firebase_token_id, platform, status
         ) VALUES (?, ?, ?, 2, 'pending')`
      ).bind(inactiveDeliveryId, v2RecipientId, inactiveTokenId),
      env.DB.prepare(
        `INSERT INTO notification_push_deliveries (
           notification_push_delivery_id, notification_recipient_id,
           firebase_token_id, platform, status
         ) VALUES (?, ?, ?, 1, 'sent')`
      ).bind(legacyDeliveryId, legacyRecipientId, activeTokenId),
    ]);

    await runMigration();

    const schedules = await env.DB.prepare(
      'SELECT notification_schedule_id FROM notification_schedules'
    ).all<{ notification_schedule_id: number }>();
    expect(schedules.results.map(row => row.notification_schedule_id)).toEqual([
      v2ScheduleId,
    ]);

    const tokens = await env.DB.prepare(
      'SELECT firebase_token_id FROM firebase_tokens'
    ).all<{ firebase_token_id: number }>();
    expect(tokens.results.map(row => row.firebase_token_id)).toEqual([
      activeTokenId,
    ]);

    const recipients = await env.DB.prepare(
      'SELECT notification_recipient_id FROM notification_recipients ORDER BY notification_recipient_id'
    ).all<{ notification_recipient_id: number }>();
    expect(recipients.results.map(row => row.notification_recipient_id)).toEqual(
      [v2RecipientId]
    );

    const deliveries = await env.DB.prepare(
      `SELECT notification_push_delivery_id, firebase_token_id
       FROM notification_push_deliveries ORDER BY notification_push_delivery_id`
    ).all<{
      notification_push_delivery_id: number;
      firebase_token_id: number | null;
    }>();
    expect(deliveries.results).toEqual([
      {
        notification_push_delivery_id: activeDeliveryId,
        firebase_token_id: activeTokenId,
      },
      {
        notification_push_delivery_id: inactiveDeliveryId,
        firebase_token_id: null,
      },
    ]);

    const scheduleColumns = await env.DB.prepare(
      'PRAGMA table_info(notification_schedules)'
    ).all<{ name: string }>();
    const scheduleColumnNames = scheduleColumns.results.map(row => row.name);
    for (const legacyColumn of [
      'created_user_id',
      'event_id',
      'firebase_token_id',
      'importance',
      'fcm_message_id',
    ]) {
      expect(scheduleColumnNames).not.toContain(legacyColumn);
    }

    const tokenColumns = await env.DB.prepare(
      'PRAGMA table_info(firebase_tokens)'
    ).all<{ name: string }>();
    expect(tokenColumns.results.map(row => row.name)).not.toContain(
      'is_firebase_active'
    );

    const scheduleIndexes = await env.DB.prepare(
      'PRAGMA index_list(notification_schedules)'
    ).all<{ name: string }>();
    const scheduleIndexNames = scheduleIndexes.results.map(row => row.name);
    expect(scheduleIndexNames).toEqual(
      expect.arrayContaining([
        'idx_notification_schedules_due',
        'idx_notification_schedules_notification_id',
      ])
    );
    expect(scheduleIndexNames).not.toContain(
      'idx_notification_schedules_event_id'
    );
    expect(scheduleIndexNames).not.toContain(
      'idx_notification_schedules_firebase_token_id'
    );

    const tokenIndexes = await env.DB.prepare(
      'PRAGMA index_list(firebase_tokens)'
    ).all<{ name: string }>();
    const tokenIndexNames = tokenIndexes.results.map(row => row.name);
    expect(tokenIndexNames).toEqual(
      expect.arrayContaining([
        'idx_firebase_tokens_user_id',
        'uq_firebase_tokens_fcm_token',
      ])
    );
    expect(tokenIndexNames).not.toContain('idx_firebase_tokens_active');

    const sequences = await env.DB.prepare(
      `SELECT name, seq FROM sqlite_sequence
       WHERE name IN ('firebase_tokens', 'notification_schedules')
       ORDER BY name`
    ).all<{ name: string; seq: number }>();
    expect(sequences.results).toEqual([
      { name: 'firebase_tokens', seq: inactiveTokenId },
      {
        name: 'notification_schedules',
        seq: v2ScheduleId,
      },
    ]);
  });
});
