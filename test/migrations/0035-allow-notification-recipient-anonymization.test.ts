import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0035_allow_notification_recipient_anonymization.sql'
  );
  if (!migration) {
    throw new Error(
      '0035_allow_notification_recipient_anonymization.sql is not registered'
    );
  }
  return migration.queries;
})();

const testPrefix = '0035通知Recipient匿名化';
const recipientIds = {
  userA: 3501,
  userB: 3502,
  userC: 3503,
} as const;
const deliveryIds = {
  userA: 3601,
  userB: 3602,
  userC: 3603,
} as const;

type Fixture = {
  userAId: number;
  userBId: number;
  userCId: number;
  scheduleId: number;
};

type RecipientDeliveryRow = {
  recipient_id: number;
  schedule_id: number;
  user_id: number | null;
  delivery_id: number;
  status: string;
};

async function prepareLegacySchema(): Promise<void> {
  const counts = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM notification_recipients) AS recipient_count,
       (SELECT COUNT(*) FROM notification_push_deliveries) AS delivery_count`
  ).first<{ recipient_count: number; delivery_count: number }>();
  if (!counts || counts.recipient_count !== 0 || counts.delivery_count !== 0) {
    throw new Error('旧Schemaの準備前にNotification行が残っています');
  }

  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS uq_notification_recipients_schedule_user'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_recipients_user_id'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS uq_notification_push_deliveries_recipient_token'
    ),
    env.DB.prepare(
      'DROP INDEX IF EXISTS idx_notification_push_deliveries_firebase_token_id'
    ),
    env.DB.prepare('DROP INDEX IF EXISTS idx_notification_push_deliveries_retry'),
    env.DB.prepare(
      'ALTER TABLE notification_push_deliveries RENAME TO __test_0035_notification_push_deliveries'
    ),
    env.DB.prepare(
      'ALTER TABLE notification_recipients RENAME TO __test_0035_notification_recipients'
    ),
    env.DB.prepare(
      `CREATE TABLE notification_recipients (
        notification_recipient_id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_schedule_id INTEGER NOT NULL
          REFERENCES notification_schedules(notification_schedule_id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE notification_push_deliveries (
        notification_push_delivery_id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_recipient_id INTEGER NOT NULL
          REFERENCES notification_recipients(notification_recipient_id) ON DELETE CASCADE,
        firebase_token_id INTEGER REFERENCES firebase_tokens(firebase_token_id)
          ON DELETE SET NULL,
        platform INTEGER NOT NULL CHECK (platform IN (1, 2)),
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        first_attempt_at TEXT,
        last_attempt_at TEXT,
        next_retry_at TEXT,
        failed_reason TEXT,
        fcm_message_id TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare('DROP TABLE __test_0035_notification_push_deliveries'),
    env.DB.prepare('DROP TABLE __test_0035_notification_recipients'),
    env.DB.prepare(
      `CREATE UNIQUE INDEX uq_notification_recipients_schedule_user
       ON notification_recipients(notification_schedule_id, user_id)`
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_recipients_user_id ON notification_recipients(user_id)'
    ),
    env.DB.prepare(
      `CREATE UNIQUE INDEX uq_notification_push_deliveries_recipient_token
       ON notification_push_deliveries(notification_recipient_id, firebase_token_id)
       WHERE firebase_token_id IS NOT NULL`
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_push_deliveries_firebase_token_id ON notification_push_deliveries(firebase_token_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_notification_push_deliveries_retry ON notification_push_deliveries(status, next_retry_at)'
    ),
  ]);
}

async function createFixture(): Promise<Fixture> {
  const userA = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(`${testPrefix}UserA`)
    .first<{ user_id: number }>();
  const userB = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(`${testPrefix}UserB`)
    .first<{ user_id: number }>();
  const userC = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(`${testPrefix}UserC`)
    .first<{ user_id: number }>();
  if (!userA || !userB || !userC) {
    throw new Error('Migrationテスト用Userの作成に失敗しました');
  }

  const notification = await env.DB.prepare(
    `INSERT INTO notifications (
       push_title, push_body, notification_type, title, body
     ) VALUES ('0035 push', '0035 body', 'notification_general', ?, '0035 detail')
     RETURNING notification_id`
  )
    .bind(`${testPrefix}通知`)
    .first<{ notification_id: number }>();
  if (!notification) {
    throw new Error('Migrationテスト用Notificationの作成に失敗しました');
  }

  const schedule = await env.DB.prepare(
    `INSERT INTO notification_schedules (
       created_user_id, scheduled_by_user_id, notification_id,
       send_status, send_at
     ) VALUES (?, ?, ?, 'scheduled', '2026-09-29T00:00:00.000Z')
     RETURNING notification_schedule_id`
  )
    .bind(userA.user_id, userA.user_id, notification.notification_id)
    .first<{ notification_schedule_id: number }>();
  if (!schedule) {
    throw new Error('Migrationテスト用Scheduleの作成に失敗しました');
  }

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO notification_recipients (
         notification_recipient_id, notification_schedule_id, user_id,
         created_at
       ) VALUES (?, ?, ?, '2026-09-29T00:01:00.000Z')`
    ).bind(recipientIds.userA, schedule.notification_schedule_id, userA.user_id),
    env.DB.prepare(
      `INSERT INTO notification_recipients (
         notification_recipient_id, notification_schedule_id, user_id,
         created_at
       ) VALUES (?, ?, ?, '2026-09-29T00:02:00.000Z')`
    ).bind(recipientIds.userB, schedule.notification_schedule_id, userB.user_id),
    env.DB.prepare(
      `INSERT INTO notification_recipients (
         notification_recipient_id, notification_schedule_id, user_id,
         created_at
       ) VALUES (?, ?, ?, '2026-09-29T00:03:00.000Z')`
    ).bind(recipientIds.userC, schedule.notification_schedule_id, userC.user_id),
  ]);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_push_delivery_id, notification_recipient_id,
         platform, status, attempt_count, created_at, updated_at
       ) VALUES (?, ?, 2, 'sent', 1, '2026-09-29T00:04:00.000Z', '2026-09-29T00:04:01.000Z')`
    ).bind(deliveryIds.userA, recipientIds.userA),
    env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_push_delivery_id, notification_recipient_id,
         platform, status, attempt_count, created_at, updated_at
       ) VALUES (?, ?, 2, 'failed', 2, '2026-09-29T00:05:00.000Z', '2026-09-29T00:05:01.000Z')`
    ).bind(deliveryIds.userB, recipientIds.userB),
    env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_push_delivery_id, notification_recipient_id,
         platform, status, attempt_count, created_at, updated_at
       ) VALUES (?, ?, 2, 'sent', 1, '2026-09-29T00:06:00.000Z', '2026-09-29T00:06:01.000Z')`
    ).bind(deliveryIds.userC, recipientIds.userC),
  ]);

  return {
    userAId: userA.user_id,
    userBId: userB.user_id,
    userCId: userC.user_id,
    scheduleId: schedule.notification_schedule_id,
  };
}

async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

async function getRecipientDeliveries(
  scheduleId: number
): Promise<RecipientDeliveryRow[]> {
  const rows = await env.DB.prepare(
    `SELECT
       r.notification_recipient_id AS recipient_id,
       r.notification_schedule_id AS schedule_id,
       r.user_id,
       d.notification_push_delivery_id AS delivery_id,
       d.status
     FROM notification_recipients r
     INNER JOIN notification_push_deliveries d
       ON d.notification_recipient_id = r.notification_recipient_id
     WHERE r.notification_schedule_id = ?
     ORDER BY r.notification_recipient_id`
  )
    .bind(scheduleId)
    .all<RecipientDeliveryRow>();
  return rows.results;
}

describe('0035_allow_notification_recipient_anonymization.sql', () => {
  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM notification_schedules
       WHERE notification_id IN (
         SELECT notification_id FROM notifications WHERE title LIKE ?
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

  it('RecipientとDeliveryの履歴を維持し、匿名化後の制約を成立させる', async () => {
    await prepareLegacySchema();
    const fixture = await createFixture();

    await runMigration();

    const columns = await env.DB.prepare(
      'PRAGMA table_info(notification_recipients)'
    ).all<{ name: string; notnull: number; pk: number }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_recipient_id',
          notnull: 0,
          pk: 1,
        }),
        expect.objectContaining({
          name: 'notification_schedule_id',
          notnull: 1,
        }),
        expect.objectContaining({ name: 'user_id', notnull: 0 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
      ])
    );

    const recipientForeignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_recipients)'
    ).all<{ table: string; from: string; to: string; on_delete: string }>();
    expect(recipientForeignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'notification_schedules',
          from: 'notification_schedule_id',
          to: 'notification_schedule_id',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          table: 'users',
          from: 'user_id',
          to: 'user_id',
          on_delete: 'SET NULL',
        }),
      ])
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(notification_recipients)'
    ).all<{ name: string; unique: number }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'uq_notification_recipients_schedule_user',
          unique: 1,
        }),
        expect.objectContaining({
          name: 'idx_notification_recipients_user_id',
          unique: 0,
        }),
      ])
    );

    // Case 1: Migration前のRecipient/DeliveryのID、Schedule、statusを維持する。
    expect(await getRecipientDeliveries(fixture.scheduleId)).toEqual([
      {
        recipient_id: recipientIds.userA,
        schedule_id: fixture.scheduleId,
        user_id: fixture.userAId,
        delivery_id: deliveryIds.userA,
        status: 'sent',
      },
      {
        recipient_id: recipientIds.userB,
        schedule_id: fixture.scheduleId,
        user_id: fixture.userBId,
        delivery_id: deliveryIds.userB,
        status: 'failed',
      },
      {
        recipient_id: recipientIds.userC,
        schedule_id: fixture.scheduleId,
        user_id: fixture.userCId,
        delivery_id: deliveryIds.userC,
        status: 'sent',
      },
    ]);

    // Case 2: User Aの物理削除はRecipientとDeliveryを削除せず、他Userへ影響しない。
    await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
      .bind(fixture.userAId)
      .run();
    expect(await getRecipientDeliveries(fixture.scheduleId)).toEqual([
      {
        recipient_id: recipientIds.userA,
        schedule_id: fixture.scheduleId,
        user_id: null,
        delivery_id: deliveryIds.userA,
        status: 'sent',
      },
      {
        recipient_id: recipientIds.userB,
        schedule_id: fixture.scheduleId,
        user_id: fixture.userBId,
        delivery_id: deliveryIds.userB,
        status: 'failed',
      },
      {
        recipient_id: recipientIds.userC,
        schedule_id: fixture.scheduleId,
        user_id: fixture.userCId,
        delivery_id: deliveryIds.userC,
        status: 'sent',
      },
    ]);

    // Case 3: 同一Scheduleで複数Userを削除しても匿名Recipientを統合しない。
    await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
      .bind(fixture.userBId)
      .run();
    const anonymizedRows = await env.DB.prepare(
      `SELECT
         r.notification_recipient_id AS recipient_id,
         d.notification_push_delivery_id AS delivery_id,
         d.status
       FROM notification_recipients r
       INNER JOIN notification_push_deliveries d
         ON d.notification_recipient_id = r.notification_recipient_id
       WHERE r.notification_schedule_id = ? AND r.user_id IS NULL
       ORDER BY r.notification_recipient_id`
    )
      .bind(fixture.scheduleId)
      .all<{ recipient_id: number; delivery_id: number; status: string }>();
    expect(anonymizedRows.results).toEqual([
      {
        recipient_id: recipientIds.userA,
        delivery_id: deliveryIds.userA,
        status: 'sent',
      },
      {
        recipient_id: recipientIds.userB,
        delivery_id: deliveryIds.userB,
        status: 'failed',
      },
    ]);

    // Case 4: 通常UserのRecipient一意性とSchedule必須を維持する。
    await expect(
      env.DB.prepare(
        `INSERT INTO notification_recipients (
           notification_schedule_id, user_id
         ) VALUES (?, ?)`
      )
        .bind(fixture.scheduleId, fixture.userCId)
        .run()
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `INSERT INTO notification_recipients (
           notification_schedule_id, user_id
         ) VALUES (NULL, ?)`
      )
        .bind(fixture.userCId)
        .run()
    ).rejects.toThrow();

    // Case 5: Recipient再構築後もDeliveryを含む外部キー整合性を保つ。
    const deliveryForeignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_push_deliveries)'
    ).all<{ table: string; from: string; to: string; on_delete: string }>();
    expect(deliveryForeignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'notification_recipients',
          from: 'notification_recipient_id',
          to: 'notification_recipient_id',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          table: 'firebase_tokens',
          from: 'firebase_token_id',
          to: 'firebase_token_id',
          on_delete: 'SET NULL',
        }),
      ])
    );
    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
