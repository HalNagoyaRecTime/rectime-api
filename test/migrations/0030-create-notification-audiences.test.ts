import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

describe('0030_create_notification_audiences.sql', () => {
  afterEach(async () => {
    await env.DB.prepare(
      `DELETE FROM notification_audiences
       WHERE notification_id IN (
         SELECT notification_id
         FROM notifications
         WHERE title LIKE '0030移行確認%'
       )`
    ).run();
    await env.DB.prepare(
      "DELETE FROM notifications WHERE title LIKE '0030移行確認%'"
    ).run();
  });

  it('Audienceの種別・対象条件・通知への外部キーを持つ', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(notification_audiences)'
    ).all<{ name: string; notnull: number; pk: number }>();

    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'notification_audience_id',
          pk: 1,
        }),
        expect.objectContaining({ name: 'notification_id', notnull: 1 }),
        expect.objectContaining({ name: 'audience_type', notnull: 1 }),
        expect.objectContaining({ name: 'class_room_id' }),
        expect.objectContaining({ name: 'gathering_id' }),
        expect.objectContaining({ name: 'event_id' }),
        expect.objectContaining({ name: 'user_id' }),
        expect.objectContaining({ name: 'user_ids' }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
        expect.objectContaining({ name: 'updated_at', notnull: 1 }),
      ])
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_audiences)'
    ).all<{ table: string; from: string; to: string; on_delete: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'notifications',
          from: 'notification_id',
          to: 'notification_id',
          on_delete: 'CASCADE',
        }),
        expect.objectContaining({
          table: 'class_rooms',
          from: 'class_room_id',
          to: 'class_room_id',
        }),
        expect.objectContaining({
          table: 'gatherings',
          from: 'gathering_id',
          to: 'gathering_id',
        }),
        expect.objectContaining({
          table: 'events',
          from: 'event_id',
          to: 'event_id',
        }),
        expect.objectContaining({
          table: 'users',
          from: 'user_id',
          to: 'user_id',
        }),
      ])
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(notification_audiences)'
    ).all<{ name: string }>();
    expect(indexes.results.map(index => index.name)).toEqual(
      expect.arrayContaining([
        'idx_notification_audiences_notification_id',
        'idx_notification_audiences_type',
      ])
    );
  });

  it('allとusersの対象条件を保存でき、不正な組み合わせを拒否する', async () => {
    const notification = await env.DB.prepare(
      `INSERT INTO notifications (notification_type, title, body)
       VALUES ('manual', '0030移行確認対象条件', '本文')
       RETURNING notification_id`
    ).first<{ notification_id: number }>();
    if (!notification) throw new Error('failed to create notification');

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO notification_audiences
          (notification_id, audience_type)
         VALUES (?, 'all')`
      ).bind(notification.notification_id),
      env.DB.prepare(
        `INSERT INTO notification_audiences
          (notification_id, audience_type, user_ids)
         VALUES (?, 'users', '[1,2]')`
      ).bind(notification.notification_id),
    ]);

    const rows = await env.DB.prepare(
      `SELECT audience_type, class_room_id, gathering_id, event_id,
              user_id, user_ids
       FROM notification_audiences
       WHERE notification_id = ?
       ORDER BY notification_audience_id`
    )
      .bind(notification.notification_id)
      .all();
    expect(rows.results).toEqual([
      {
        audience_type: 'all',
        class_room_id: null,
        gathering_id: null,
        event_id: null,
        user_id: null,
        user_ids: null,
      },
      {
        audience_type: 'users',
        class_room_id: null,
        gathering_id: null,
        event_id: null,
        user_id: null,
        user_ids: '[1,2]',
      },
    ]);

    await expect(
      env.DB.prepare(
        `INSERT INTO notification_audiences
          (notification_id, audience_type, event_id)
         VALUES (?, 'all', 1)`
      )
        .bind(notification.notification_id)
        .run()
    ).rejects.toThrow();
  });

  it('Audienceを削除しても既存Notificationを壊さず、Notification削除時に連動削除する', async () => {
    const notification = await env.DB.prepare(
      `INSERT INTO notifications (notification_type, title, body)
       VALUES ('manual', '0030移行確認削除', '本文')
       RETURNING notification_id`
    ).first<{ notification_id: number }>();
    if (!notification) throw new Error('failed to create notification');

    await env.DB.prepare(
      `INSERT INTO notification_audiences (notification_id, audience_type)
       VALUES (?, 'all')`
    )
      .bind(notification.notification_id)
      .run();

    await expect(
      env.DB.prepare(
        'SELECT notification_id FROM notifications WHERE notification_id = ?'
      )
        .bind(notification.notification_id)
        .first()
    ).resolves.toEqual({ notification_id: notification.notification_id });

    await env.DB.prepare('DELETE FROM notifications WHERE notification_id = ?')
      .bind(notification.notification_id)
      .run();
    await expect(
      env.DB.prepare(
        'SELECT notification_audience_id FROM notification_audiences WHERE notification_id = ?'
      )
        .bind(notification.notification_id)
        .first()
    ).resolves.toBeNull();
  });
});
