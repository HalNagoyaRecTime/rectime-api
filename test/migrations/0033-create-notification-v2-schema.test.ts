import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0033_create_notification_v2_schema.sql'
  );
  if (!migration) {
    throw new Error(
      '0033_create_notification_v2_schema.sql is not registered'
    );
  }
  return migration.queries;
})();

const legacyUserName = '0033通知v2移行テスト利用者';
const legacyNotificationId = 9001;
const legacyTokenId = 9402;
const currentOwnerUserName = '0033通知v2移行テスト現在所有者';
const currentOwnerTokenId = 9401;
const inactiveOnlyTokenId = 9403;
const inactiveDuplicateTokenId = 9404;
const currentOwnerScheduleId = 9502;
const legacyScheduleId = 9999;

async function prepareLegacySchema(): Promise<void> {

  await env.DB.batch([
    env.DB.prepare('DROP TABLE notification_push_deliveries'),
    env.DB.prepare('DROP TABLE notification_recipients'),
    env.DB.prepare('DROP TABLE notification_audiences'),
    env.DB.prepare('DROP INDEX IF EXISTS uq_notifications_source'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_user_id'),
    env.DB.prepare('DROP INDEX IF EXISTS uq_firebase_tokens_fcm_token'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_active_fcm_token'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_active'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_schedules_due'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_schedules_event_id'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_schedules_notification_id'
    ),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_schedules_firebase_token_id'
    ),
    env.DB.prepare('DROP INDEX IF EXISTS idx_users_live_active_user_id'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_students_class_room_id_user_id'),
    env.DB.prepare(
      'ALTER TABLE notification_schedules RENAME TO __migration_0033_current_schedules'
    ),
    env.DB.prepare(
      'ALTER TABLE firebase_tokens RENAME TO __migration_0033_current_tokens'
    ),
    env.DB.prepare(
      'ALTER TABLE notifications RENAME TO __migration_0033_current_notifications'
    ),
    env.DB.prepare(
      `CREATE TABLE notifications (
        notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE firebase_tokens (
        firebase_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id),
        platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
        fcm_token TEXT NOT NULL,
        is_firebase_active INTEGER NOT NULL DEFAULT 1,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE notification_schedules (
        notification_schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_user_id INTEGER REFERENCES users(user_id),
        event_id INTEGER REFERENCES events(event_id),
        notification_id INTEGER NOT NULL REFERENCES notifications(notification_id),
        firebase_token_id INTEGER NOT NULL REFERENCES firebase_tokens(firebase_token_id),
        importance INTEGER NOT NULL DEFAULT 2
          CHECK (importance BETWEEN 1 AND 4),
        send_status TEXT NOT NULL DEFAULT 'draft',
        fcm_message_id TEXT,
        failed_reason TEXT,
        send_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
  ]);
}

async function restoreCurrentSchema(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS uq_notifications_source'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_push_deliveries_firebase_token_id'
    ),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_push_deliveries_retry'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS uq_notification_push_deliveries_recipient_token'
    ),
    env.DB.prepare(
      'DROP INDEX IF EXISTS uq_notification_recipients_schedule_user'
    ),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_recipients_user_id'
    ),
    env.DB.prepare(
      'DROP INDEX IF EXISTS uq_notification_audiences_schedule_target'
    ),
    env.DB.prepare(
      'DROP INDEX IF EXISTS uq_notification_audiences_schedule_all'
    ),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_schedules_due'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_schedules_event_id'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_schedules_notification_id'
    ),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_schedules_firebase_token_id'
    ),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_user_id'),
    env.DB.prepare('DROP INDEX IF EXISTS uq_firebase_tokens_fcm_token'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_active_fcm_token'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_firebase_tokens_active'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_users_live_active_user_id'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_students_class_room_id_user_id'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_push_deliveries'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_recipients'),
    env.DB.prepare('DROP TABLE IF EXISTS notification_audiences'),
    env.DB.prepare('DROP TABLE notification_schedules'),
    env.DB.prepare('DROP TABLE notifications'),
    env.DB.prepare('DROP TABLE firebase_tokens'),
    env.DB.prepare(
      'ALTER TABLE __migration_0033_current_notifications RENAME TO notifications'
    ),
    env.DB.prepare(
      'ALTER TABLE __migration_0033_current_tokens RENAME TO firebase_tokens'
    ),
    env.DB.prepare(
      'ALTER TABLE __migration_0033_current_schedules RENAME TO notification_schedules'
    ),
    env.DB.prepare(
      `CREATE UNIQUE INDEX uq_notifications_source
       ON notifications(source_type, source_id, notification_type, source_hash)`
    ),
    env.DB.prepare(
      'CREATE INDEX idx_firebase_tokens_user_id ON firebase_tokens(user_id)'
    ),
    env.DB.prepare(
      `CREATE UNIQUE INDEX uq_firebase_tokens_fcm_token
       ON firebase_tokens(fcm_token)`
    ),
    env.DB.prepare(
      'CREATE INDEX idx_firebase_tokens_active ON firebase_tokens(is_firebase_active)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_schedules_due ON notification_schedules(send_status, send_at)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_schedules_event_id ON notification_schedules(event_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_schedules_notification_id ON notification_schedules(notification_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_schedules_firebase_token_id ON notification_schedules(firebase_token_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_users_live_active_user_id ON users(is_live_active, user_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_students_class_room_id_user_id ON students(class_room_id, user_id)'
    ),
  ]);
}

async function createLegacyRows(): Promise<{
  historyUserId: number;
  currentOwnerUserId: number;
}> {
  const inactiveOnlyUser = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind('0033通知v2移行テストinactive専用')
    .first<{ user_id: number }>();
  const inactiveDuplicateUser = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind('0033通知v2移行テストinactive重複')
    .first<{ user_id: number }>();
  if (!inactiveOnlyUser || !inactiveDuplicateUser) {
    throw new Error('failed to create inactive token users');
  }
  const historyUser = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(legacyUserName)
    .first<{ user_id: number }>();
  const currentOwnerUser = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(currentOwnerUserName)
    .first<{ user_id: number }>();
  if (!historyUser || !currentOwnerUser) {
    throw new Error('failed to create legacy users');
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO notifications (
         notification_id, notification_type, title, body,
         created_at, updated_at
       ) VALUES (?, 'manual', 'Legacy件名', 'Legacy本文',
         '2026-09-01 01:02:03', '2026-09-01 04:05:06')`
    ).bind(legacyNotificationId),
    env.DB.prepare(
      `INSERT INTO firebase_tokens (
         firebase_token_id, user_id, platform, fcm_token,
         is_firebase_active, last_seen_at, created_at, updated_at
       ) VALUES (?, ?, 2, 'legacy-0033-token', 0,
         '2026-09-02 01:02:03', '2026-09-02 04:05:06', '2026-09-02 07:08:09')`
    ).bind(legacyTokenId, historyUser.user_id),
    env.DB.prepare(
      `INSERT INTO firebase_tokens (
         firebase_token_id, user_id, platform, fcm_token,
         is_firebase_active, last_seen_at, created_at, updated_at
       ) VALUES (?, ?, 2, 'legacy-0033-token', 1,
         '2026-09-02 02:02:03', '2026-09-02 05:05:06', '2026-09-02 08:08:09')`
    ).bind(currentOwnerTokenId, currentOwnerUser.user_id),
    env.DB.prepare(
      `INSERT INTO firebase_tokens (
         firebase_token_id, user_id, platform, fcm_token,
         is_firebase_active, last_seen_at, created_at, updated_at
       ) VALUES (?, ?, 2, 'inactive-only-0033-token', 0,
         '2026-09-02 03:02:03', '2026-09-02 06:05:06', '2026-09-02 09:08:09')`
    ).bind(inactiveOnlyTokenId, inactiveOnlyUser.user_id),
    env.DB.prepare(
      `INSERT INTO firebase_tokens (
         firebase_token_id, user_id, platform, fcm_token,
         is_firebase_active, last_seen_at, created_at, updated_at
       ) VALUES (?, ?, 2, 'inactive-only-0033-token', 0,
         '2026-09-02 04:02:03', '2026-09-02 07:05:06', '2026-09-02 10:08:09')`
    ).bind(inactiveDuplicateTokenId, inactiveDuplicateUser.user_id),
    env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_schedule_id, created_user_id, notification_id,
         firebase_token_id, importance, send_status, fcm_message_id,
         failed_reason, send_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 3, 'sent', 'legacy-fcm-id', 'legacy-error',
         '2026-09-03 01:02:03', '2026-09-03 04:05:06',
         '2026-09-03 07:08:09')`
    ).bind(
      legacyScheduleId,
      historyUser.user_id,
      legacyNotificationId,
      legacyTokenId
    ),
    env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_schedule_id, created_user_id, notification_id,
         firebase_token_id, importance, send_status, fcm_message_id,
         failed_reason, send_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 3, 'sent', 'legacy-current-fcm-id',
         'legacy-current-error', '2026-09-03 02:02:03',
         '2026-09-03 05:05:06', '2026-09-03 08:08:09')`
    ).bind(
      currentOwnerScheduleId,
      currentOwnerUser.user_id,
      legacyNotificationId,
      currentOwnerTokenId
    ),
  ]);

  return {
    historyUserId: historyUser.user_id,
    currentOwnerUserId: currentOwnerUser.user_id,
  };
}
async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

describe('0033_create_notification_v2_schema.sql', () => {
  afterEach(async () => {
    await restoreCurrentSchema();
    await env.DB.prepare('DELETE FROM users WHERE user_name LIKE ?')
      .bind('0033通知v2移行テスト%')
      .run();
  });

  it('Legacy inactive TokenとScheduleを破棄し、新しいv2構造と制約を作成する', async () => {
    await prepareLegacySchema();
    const { historyUserId, currentOwnerUserId } = await createLegacyRows();

    await runMigration();

    const legacyNotification = await env.DB.prepare(
      'SELECT * FROM notifications WHERE notification_id = ?'
    )
      .bind(legacyNotificationId)
      .first();
    expect(legacyNotification).toMatchObject({
      notification_id: legacyNotificationId,
      notification_type: 'manual',
      title: 'Legacy件名',
      body: 'Legacy本文',
      push_title: 'Legacy件名',
      push_body: 'Legacy本文',
      created_by_user_id: null,
      importance: 'normal',
    });

    const legacySchedule = await env.DB.prepare(
      'SELECT * FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(legacyScheduleId)
      .first();
    expect(legacySchedule).toBeNull();

    const currentSchedule = await env.DB.prepare(
      'SELECT * FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(currentOwnerScheduleId)
      .first();
    expect(currentSchedule).toMatchObject({
      notification_schedule_id: currentOwnerScheduleId,
      created_user_id: currentOwnerUserId,
      notification_id: legacyNotificationId,
      firebase_token_id: currentOwnerTokenId,
      send_status: 'sent',
      fcm_message_id: 'legacy-current-fcm-id',
    });

    const migratedTokens = await env.DB.prepare(
      `SELECT firebase_token_id, user_id, fcm_token, is_firebase_active
       FROM firebase_tokens
       WHERE firebase_token_id IN (?, ?, ?, ?)
       ORDER BY firebase_token_id`
    )
      .bind(
        legacyTokenId,
        currentOwnerTokenId,
        inactiveOnlyTokenId,
        inactiveDuplicateTokenId
      )
      .all<{
        firebase_token_id: number;
        user_id: number;
        fcm_token: string;
        is_firebase_active: number;
      }>();
    expect(migratedTokens.results).toEqual([
      {
        firebase_token_id: currentOwnerTokenId,
        user_id: currentOwnerUserId,
        fcm_token: 'legacy-0033-token',
        is_firebase_active: 1,
      },
    ]);
    const tokenIndexes = await env.DB.prepare(
      'PRAGMA index_list(firebase_tokens)'
    ).all<{ name: string; unique: number }>();
    expect(tokenIndexes.results).toContainEqual(
      expect.objectContaining({
        name: 'uq_firebase_tokens_fcm_token',
        unique: 1,
      })
    );
    expect(tokenIndexes.results.map(index => index.name)).not.toContain(
      'idx_firebase_tokens_active_fcm_token'
    );

    const notificationColumns = await env.DB.prepare(
      'PRAGMA table_info(notifications)'
    ).all<{ name: string; dflt_value: string | null }>();
    expect(notificationColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'push_title', dflt_value: null }),
        expect.objectContaining({ name: 'push_body', dflt_value: null }),
      ])
    );

    for (const importance of ['low', 'normal', 'high']) {
      await env.DB.prepare(
        "INSERT INTO notifications (push_title, push_body, title, body, importance, notification_type) VALUES ('check', 'body', 'check', 'body', ?, 'manual')"
      )
        .bind(importance)
        .run();
    }
    await expect(
      env.DB.prepare(
        "INSERT INTO notifications (push_title, push_body, title, body, importance, notification_type) VALUES ('invalid', 'body', 'invalid', 'body', 'urgent', 'manual')"
      ).run()
    ).rejects.toThrow();

    const scheduleColumns = await env.DB.prepare(
      'PRAGMA table_info(notification_schedules)'
    ).all<{ name: string; dflt_value: string | null }>();
    expect(scheduleColumns.results).toContainEqual(
      expect.objectContaining({ name: 'send_status', dflt_value: null })
    );

    await expect(
      env.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 0, 'invalid-platform-0033-0')`
      )
        .bind(currentOwnerUserId)
        .run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 3, 'invalid-platform-0033-3')`
      )
        .bind(currentOwnerUserId)
        .run()
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO firebase_tokens (
           user_id, platform, fcm_token, is_firebase_active
         ) VALUES (?, 1, 'legacy-0033-token', 0)`
      )
        .bind(historyUserId)
        .run()
    ).rejects.toThrow();
    const discardedInactiveTokens = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM firebase_tokens
       WHERE firebase_token_id IN (?, ?, ?)`
    )
      .bind(legacyTokenId, inactiveOnlyTokenId, inactiveDuplicateTokenId)
      .first<{ count: number }>();
    expect(discardedInactiveTokens?.count).toBe(0);
    const discardedScheduleCount = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM notification_schedules
       WHERE notification_schedule_id = ?`
    )
      .bind(legacyScheduleId)
      .first<{ count: number }>();
    expect(discardedScheduleCount?.count).toBe(0);


    const convertedRows = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notification_audiences) AS audience_count,
         (SELECT COUNT(*) FROM notification_recipients) AS recipient_count,
         (SELECT COUNT(*) FROM notification_push_deliveries) AS delivery_count`
    ).first<{
      audience_count: number;
      recipient_count: number;
      delivery_count: number;
    }>();
    expect(convertedRows).toEqual({
      audience_count: 0,
      recipient_count: 0,
      delivery_count: 0,
    });

    const newToken = await env.DB.prepare(
      `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
       VALUES (?, 1, 'new-0033-token')
       RETURNING firebase_token_id`
    )
      .bind(currentOwnerUserId)
      .first<{ firebase_token_id: number }>();
    expect(newToken?.firebase_token_id).toBeGreaterThan(inactiveDuplicateTokenId);

    const newNotification = await env.DB.prepare(
      `INSERT INTO notifications (
         created_by_user_id, push_title, push_body, title, body,
         importance, notification_type
       ) VALUES (?, 'Push件名', 'Push本文', '詳細件名', '詳細本文',
         'high', 'notification_general')
       RETURNING notification_id`
    )
      .bind(currentOwnerUserId)
      .first<{ notification_id: number }>();
    if (!newNotification) throw new Error('failed to create v2 notification');
    expect(newNotification.notification_id).toBeGreaterThan(legacyNotificationId);

    const newSchedule = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_id, scheduled_by_user_id, send_status, send_at
       ) VALUES (?, ?, 'scheduled', '2026-09-04 01:02:03')
       RETURNING notification_schedule_id`
    )
      .bind(newNotification.notification_id, currentOwnerUserId)
      .first<{ notification_schedule_id: number }>();
    if (!newSchedule) throw new Error('failed to create v2 schedule');
    expect(newSchedule.notification_schedule_id).toBeGreaterThan(legacyScheduleId);

    const audience = await env.DB.prepare(
      `INSERT INTO notification_audiences (
         notification_schedule_id, audience_type
       ) VALUES (?, 'all')
       RETURNING notification_audience_id`
    )
      .bind(newSchedule.notification_schedule_id)
      .first<{ notification_audience_id: number }>();
    if (!audience) throw new Error('failed to create v2 audience');
    await expect(
      env.DB.prepare(
        `INSERT INTO notification_audiences (
           notification_schedule_id, audience_type
         ) VALUES (?, 'all')`
      )
        .bind(newSchedule.notification_schedule_id)
        .run()
    ).rejects.toThrow();
    for (const audienceType of [
      'class_room',
      'gathering',
      'event',
      'user',
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO notification_audiences (
           notification_schedule_id, audience_type, target_id
         ) VALUES (?, ?, 1)`
      )
        .bind(newSchedule.notification_schedule_id, audienceType)
        .run();
    }
    await expect(
      env.DB.prepare(
        `INSERT INTO notification_audiences (
           notification_schedule_id, audience_type, target_id
         ) VALUES (?, 'invalid', 1)`
      )
        .bind(newSchedule.notification_schedule_id)
        .run()
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_audiences (
           notification_schedule_id, audience_type
         ) VALUES (?, 'class_room')`
      )
        .bind(newSchedule.notification_schedule_id)
        .run()
    ).rejects.toThrow();

    const recipient = await env.DB.prepare(
      `INSERT INTO notification_recipients (
         notification_schedule_id, user_id
       ) VALUES (?, ?)
       RETURNING notification_recipient_id`
    )
      .bind(newSchedule.notification_schedule_id, currentOwnerUserId)
      .first<{ notification_recipient_id: number }>();
    if (!recipient) throw new Error('failed to create v2 recipient');

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_recipients (
           notification_schedule_id, user_id
         ) VALUES (?, ?)`
      )
        .bind(newSchedule.notification_schedule_id, currentOwnerUserId)
        .run()
    ).rejects.toThrow();

    const delivery = await env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_recipient_id, firebase_token_id, platform, status
       ) VALUES (?, ?, 2, 'pending')
       RETURNING notification_push_delivery_id`
    )
      .bind(recipient.notification_recipient_id, newToken!.firebase_token_id)
      .first<{ notification_push_delivery_id: number }>();
    if (!delivery) throw new Error('failed to create v2 delivery');
    await expect(
      env.DB.prepare(
        `INSERT INTO notification_push_deliveries (
           notification_recipient_id, firebase_token_id, platform, status
         ) VALUES (?, NULL, 0, 'pending')`
      )
        .bind(recipient.notification_recipient_id)
        .run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `INSERT INTO notification_push_deliveries (
           notification_recipient_id, firebase_token_id, platform, status,
           attempt_count
         ) VALUES (?, NULL, 2, 'pending', -1)`
      )
        .bind(recipient.notification_recipient_id)
        .run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        'DELETE FROM notifications WHERE notification_id = ?'
      )
        .bind(newNotification.notification_id)
        .run()
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_push_deliveries (
           notification_recipient_id, firebase_token_id, platform, status
         ) VALUES (?, ?, 2, 'pending')`
      )
        .bind(recipient.notification_recipient_id, newToken!.firebase_token_id)
        .run()
    ).rejects.toThrow();

    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(newToken!.firebase_token_id)
      .run();
    const detachedDelivery = await env.DB.prepare(
      `SELECT firebase_token_id
       FROM notification_push_deliveries
       WHERE notification_push_delivery_id = ?`
    )
      .bind(delivery.notification_push_delivery_id)
      .first<{ firebase_token_id: number | null }>();
    expect(detachedDelivery?.firebase_token_id).toBeNull();

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);

    await env.DB.prepare(
      'DELETE FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(newSchedule.notification_schedule_id)
      .run();
    const childCounts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notification_audiences
          WHERE notification_schedule_id = ?) AS audience_count,
         (SELECT COUNT(*) FROM notification_recipients
          WHERE notification_schedule_id = ?) AS recipient_count,
         (SELECT COUNT(*) FROM notification_push_deliveries) AS delivery_count`
    )
      .bind(
        newSchedule.notification_schedule_id,
        newSchedule.notification_schedule_id
      )
      .first<{
        audience_count: number;
        recipient_count: number;
        delivery_count: number;
      }>();
    expect(childCounts).toEqual({
      audience_count: 0,
      recipient_count: 0,
      delivery_count: 0,
    });

    await env.DB.prepare(
      'DELETE FROM notifications WHERE notification_id = ?'
    )
      .bind(newNotification.notification_id)
      .run();
    const deletedNotification = await env.DB.prepare(
      'SELECT notification_id FROM notifications WHERE notification_id = ?'
    )
      .bind(newNotification.notification_id)
      .first();
    expect(deletedNotification).toBeNull();
  });
});
