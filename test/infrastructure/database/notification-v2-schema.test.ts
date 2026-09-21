import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const testPrefix = '通知v2スキーマテスト';

async function createUser(name: string): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(`${testPrefix}${name}`)
    .first<{ user_id: number }>();
  if (!row) throw new Error('failed to create test user');
  return row.user_id;
}

async function createNotification(userId: number): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO notifications (
       created_by_user_id, push_title, push_body, title, body,
       importance, notification_type, source_type, source_id, source_hash
     ) VALUES (?, 'push title', 'push body', '通知v2スキーマテストdetail title', 'detail body',
       'normal', 'notification_general', 'gathering', 9001, 'schema-source-9001')
     RETURNING notification_id`
  )
    .bind(userId)
    .first<{ notification_id: number }>();
  if (!row) throw new Error('failed to create test notification');
  return row.notification_id;
}

async function createSchedule(notificationId: number): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO notification_schedules (
       notification_id, send_status, send_at
     ) VALUES (?, 'scheduled', '2026-11-07 06:35:00')
     RETURNING notification_schedule_id`
  )
    .bind(notificationId)
    .first<{ notification_schedule_id: number }>();
  if (!row) throw new Error('failed to create test schedule');
  return row.notification_schedule_id;
}

describe('通知v2のDB Schema', () => {
  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM notifications
       WHERE title LIKE ? OR push_title LIKE ?`
    )
      .bind(`${testPrefix}%`, `${testPrefix}%`)
      .run();
    await env.DB.prepare('DELETE FROM users WHERE user_name LIKE ?')
      .bind(`${testPrefix}%`)
      .run();
  });

  it('新しい通知関連テーブルとv2列を持つ', async () => {
    const notificationColumns = await env.DB.prepare(
      'PRAGMA table_info(notifications)'
    ).all<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>();
    expect(notificationColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'created_by_user_id',
          notnull: 0,
        }),
        expect.objectContaining({
          name: 'push_title',
          type: 'TEXT',
          notnull: 1,
          dflt_value: null,
        }),
        expect.objectContaining({
          name: 'push_body',
          type: 'TEXT',
          notnull: 1,
          dflt_value: null,
        }),
        expect.objectContaining({
          name: 'importance',
          type: 'TEXT',
          notnull: 1,
          dflt_value: "'normal'",
        }),
      ])
    );

    const scheduleColumns = await env.DB.prepare(
      'PRAGMA table_info(notification_schedules)'
    ).all<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>();
    expect(scheduleColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'send_status',
          notnull: 1,
          dflt_value: null,
        }),
      ])
    );
    expect(scheduleColumns.results.map(column => column.name)).toEqual(
      expect.arrayContaining([
        'firebase_token_id',
        'scheduled_by_user_id',
        'recipients_resolved_at',
        'started_at',
        'completed_at',
        'stopped_at',
        'stopped_by_user_id',
        'reason',
      ])
    );

    const tables = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name IN (
           'notification_audiences',
           'notification_recipients',
           'notification_push_deliveries'
         )
       ORDER BY name`
    ).all<{ name: string }>();
    expect(tables.results.map(table => table.name)).toEqual([
      'notification_audiences',
      'notification_push_deliveries',
      'notification_recipients',
    ]);

    const deliveryColumns = await env.DB.prepare(
      'PRAGMA table_info(notification_push_deliveries)'
    ).all<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>();
    expect(deliveryColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'status',
          notnull: 1,
          dflt_value: null,
        }),
        expect.objectContaining({
          name: 'attempt_count',
          notnull: 1,
          dflt_value: '0',
        }),
      ])
    );
  });

  it('後続ResolverとWorker向けのindexを持つ', async () => {
    const tokenIndexes = await env.DB.prepare(
      'PRAGMA index_list(firebase_tokens)'
    ).all<{ name: string; unique: number }>();
    expect(tokenIndexes.results.map(index => index.name)).toContain(
      'idx_firebase_tokens_user_id'
    );
    expect(tokenIndexes.results).toContainEqual(
      expect.objectContaining({
        name: 'uq_firebase_tokens_fcm_token',
        unique: 1,
      })
    );
    expect(tokenIndexes.results.map(index => index.name)).not.toContain(
      'idx_firebase_tokens_active_fcm_token'
    );

    const deliveryIndexes = await env.DB.prepare(
      'PRAGMA index_list(notification_push_deliveries)'
    ).all<{ name: string }>();
    expect(deliveryIndexes.results.map(index => index.name)).toEqual(
      expect.arrayContaining([
        'idx_notification_push_deliveries_firebase_token_id',
        'idx_notification_push_deliveries_retry',
      ])
    );

    const userIndexes = await env.DB.prepare('PRAGMA index_list(users)').all<{
      name: string;
    }>();
    expect(userIndexes.results.map(index => index.name)).toContain(
      'idx_users_live_active_user_id'
    );

    const studentIndexes = await env.DB.prepare(
      'PRAGMA index_list(students)'
    ).all<{ name: string }>();
    expect(studentIndexes.results.map(index => index.name)).toContain(
      'idx_students_class_room_id_user_id'
    );
  });

  it('複数Token、Audience制約、RecipientとDeliveryの冪等制約を持つ', async () => {
    const userId = await createUser('複数Token');
    const notificationId = await createNotification(userId);
    const scheduleId = await createSchedule(notificationId);

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_schedules (
           notification_id, send_at
         ) VALUES (?, '2026-11-07 06:36:00')`
      )
        .bind(notificationId)
        .run()
    ).rejects.toThrow();
    const tokenRows = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 1, 'schema-v2-token-ios')`
      ).bind(userId),
      env.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 2, 'schema-v2-token-android')`
      ).bind(userId),
    ]);
    expect(tokenRows).toHaveLength(2);

    const tokenIds = await env.DB.prepare(
      `SELECT firebase_token_id FROM firebase_tokens
       WHERE user_id = ? ORDER BY firebase_token_id`
    )
      .bind(userId)
      .all<{ firebase_token_id: number }>();
    const [iosTokenId, androidTokenId] = tokenIds.results.map(
      row => row.firebase_token_id
    );

    const audience = await env.DB.prepare(
      `INSERT INTO notification_audiences
         (notification_schedule_id, audience_type)
       VALUES (?, 'all') RETURNING notification_audience_id`
    )
      .bind(scheduleId)
      .first<{ notification_audience_id: number }>();
    expect(audience?.notification_audience_id).toBeTypeOf('number');

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_audiences
           (notification_schedule_id, audience_type)
         VALUES (?, 'class_room')`
      )
        .bind(scheduleId)
        .run()
    ).rejects.toThrow();

    const recipient = await env.DB.prepare(
      `INSERT INTO notification_recipients (notification_schedule_id, user_id)
       VALUES (?, ?) RETURNING notification_recipient_id`
    )
      .bind(scheduleId, userId)
      .first<{ notification_recipient_id: number }>();
    if (!recipient) throw new Error('failed to create test recipient');

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_recipients (notification_schedule_id, user_id)
         VALUES (?, ?)`
      )
        .bind(scheduleId, userId)
        .run()
    ).rejects.toThrow();

    const delivery = await env.DB.prepare(
      `INSERT INTO notification_push_deliveries
         (notification_recipient_id, firebase_token_id, platform, status)
       VALUES (?, ?, 1, 'pending') RETURNING notification_push_delivery_id`
    )
      .bind(recipient.notification_recipient_id, iosTokenId)
      .first<{ notification_push_delivery_id: number }>();
    if (!delivery) throw new Error('failed to create test delivery');

    const androidDelivery = await env.DB.prepare(
      `INSERT INTO notification_push_deliveries
         (notification_recipient_id, firebase_token_id, platform, status)
       VALUES (?, ?, 1, 'pending') RETURNING notification_push_delivery_id`
    )
      .bind(recipient.notification_recipient_id, androidTokenId)
      .first<{ notification_push_delivery_id: number }>();
    if (!androidDelivery)
      throw new Error('failed to create Android test delivery');

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_push_deliveries
           (notification_recipient_id, firebase_token_id, platform, status)
         VALUES (?, ?, 1, 'pending')`
      )
        .bind(recipient.notification_recipient_id, androidTokenId)
        .run()
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_push_deliveries
           (notification_recipient_id, firebase_token_id, platform, status)
         VALUES (?, ?, 1, 'pending')`
      )
        .bind(recipient.notification_recipient_id, iosTokenId)
        .run()
    ).rejects.toThrow();
    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(iosTokenId)
      .run();
    const detached = await env.DB.prepare(
      `SELECT firebase_token_id FROM notification_push_deliveries
       WHERE notification_push_delivery_id = ?`
    )
      .bind(delivery.notification_push_delivery_id)
      .first<{ firebase_token_id: number | null }>();
    expect(detached?.firebase_token_id).toBeNull();
    expect(androidTokenId).toBeTypeOf('number');
  });

  it('Notificationのsource重複防止とSchedule削除時のCASCADEを持つ', async () => {
    const userId = await createUser('source制約');
    const notificationId = await createNotification(userId);
    const scheduleId = await createSchedule(notificationId);

    await expect(
      env.DB.prepare(
        `INSERT INTO notifications
           (push_title, push_body, title, body, importance, notification_type,
            source_type, source_id, source_hash)
         VALUES ('p', 'b', 't', 'd', 'normal', 'notification_general',
                 'gathering', 9001, 'schema-source-9001')`
      ).run()
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO notifications
           (push_title, push_body, title, body, importance, notification_type,
            source_type)
         VALUES ('p', 'b', 't', 'd', 'normal', 'notification_general',
                 'gathering')`
      ).run()
    ).rejects.toThrow();

    await env.DB.prepare(
      `INSERT INTO notification_recipients (notification_schedule_id, user_id)
       VALUES (?, ?)`
    )
      .bind(scheduleId, userId)
      .run();
    await env.DB.prepare(
      'DELETE FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(scheduleId)
      .run();

    const childCounts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM notification_audiences WHERE notification_schedule_id = ?) AS audience_count,
         (SELECT COUNT(*) FROM notification_recipients WHERE notification_schedule_id = ?) AS recipient_count`
    )
      .bind(scheduleId, scheduleId)
      .first<{ audience_count: number; recipient_count: number }>();
    expect(childCounts).toEqual({ audience_count: 0, recipient_count: 0 });
  });
});
