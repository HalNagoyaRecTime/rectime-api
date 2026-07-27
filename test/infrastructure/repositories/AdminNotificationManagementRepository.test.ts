import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAdminNotificationManagementRepository } from '../../../src/infrastructure/repositories/AdminNotificationManagementRepository';

interface Fixture {
  creatorId: number;
  notificationId: number;
  eventId: number;
  classRoomId: number;
  tokenIds: number[];
}

async function createFixture(
  statuses: Array<'draft' | 'sending' | 'sent' | 'failed'> = ['draft', 'draft'],
  notificationType: 'manual' | 'event_reminder' = 'manual'
): Promise<Fixture> {
  const classroom = await env.DB.prepare(
    "INSERT INTO class_rooms (class_code, class_name) VALUES ('A1', 'A組') RETURNING class_room_id"
  ).first<{ class_room_id: number }>();
  const creator = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('管理者') RETURNING user_id"
  ).first<{ user_id: number }>();
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('大縄跳び', '体育館', '1000', '1030') RETURNING event_id"
  ).first<{ event_id: number }>();
  const notification = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, title, body) VALUES (?, '変更前', '本文') RETURNING notification_id"
  )
    .bind(notificationType)
    .first<{ notification_id: number }>();
  const tokenIds: number[] = [];

  for (let index = 0; index < statuses.length; index += 1) {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(`参加者${index + 1}`)
      .first<{ user_id: number }>();
    await env.DB.prepare(
      'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, ?, ?)'
    )
      .bind(user!.user_id, classroom!.class_room_id, index + 1, `S${index + 1}`)
      .run();
    const token = await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?) RETURNING firebase_token_id'
    )
      .bind(user!.user_id, `token-${index + 1}`)
      .first<{ firebase_token_id: number }>();
    tokenIds.push(token!.firebase_token_id);
    await env.DB.prepare(
      `INSERT INTO notification_schedules (
         created_user_id, event_id, notification_id, firebase_token_id,
         importance, send_status, send_at
       ) VALUES (?, ?, ?, ?, 2, ?, ?)`
    )
      .bind(
        creator!.user_id,
        event!.event_id,
        notification!.notification_id,
        token!.firebase_token_id,
        statuses[index],
        '2026-07-23T09:00:00+09:00'
      )
      .run();
  }

  return {
    creatorId: creator!.user_id,
    notificationId: notification!.notification_id,
    eventId: event!.event_id,
    classRoomId: classroom!.class_room_id,
    tokenIds,
  };
}

describe('AdminNotificationManagementRepository', () => {
  const repository = createAdminNotificationManagementRepository(env.DB);

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM gathering_groups'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM class_rooms'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('Token単位の予定をnotification_id単位で集約する', async () => {
    const fixture = await createFixture(['draft', 'sending', 'sent', 'failed']);

    const detail = await repository.findById(fixture.notificationId);

    expect(detail).toMatchObject({
      notification_id: fixture.notificationId,
      related_event_id: fixture.eventId,
      related_event_name: '大縄跳び',
      creator_name: '管理者',
      recipient_count: 4,
      audience: {
        type: 'event_participants',
        event_id: fixture.eventId,
        recipient_count: 4,
      },
      delivery_summary: {
        total: 4,
        draft: 1,
        sending: 1,
        sent: 1,
        failed: 1,
      },
      scheduled_at: '2026-07-23T09:00:00+09:00',
    });
  });

  it('自動競技通知は一覧・詳細・更新・削除の対象にしない', async () => {
    const fixture = await createFixture(['draft', 'draft'], 'event_reminder');

    await expect(repository.findAll({ limit: 10, offset: 0 })).resolves.toEqual(
      {
        notifications: [],
        total: 0,
      }
    );
    await expect(
      repository.findById(fixture.notificationId)
    ).resolves.toBeNull();
    await expect(
      repository.update({
        notification_id: fixture.notificationId,
        title: '変更後',
        scheduled_at: '2026-07-23T10:00:00+09:00',
        created_user_id: fixture.creatorId,
      })
    ).resolves.toBe('not_found');
    await expect(repository.deleteDraft(fixture.notificationId)).resolves.toBe(
      'not_found'
    );

    const notification = await env.DB.prepare(
      'SELECT title FROM notifications WHERE notification_id = ?'
    )
      .bind(fixture.notificationId)
      .first<{ title: string }>();
    const schedules = await env.DB.prepare(
      `SELECT send_at
       FROM notification_schedules
       WHERE notification_id = ?
       ORDER BY notification_schedule_id`
    )
      .bind(fixture.notificationId)
      .all<{ send_at: string }>();
    expect(notification?.title).toBe('変更前');
    expect(schedules.results).toEqual([
      { send_at: '2026-07-23T09:00:00+09:00' },
      { send_at: '2026-07-23T09:00:00+09:00' },
    ]);
  });

  it('状態で絞り込んでも集計件数を欠落させない', async () => {
    const fixture = await createFixture(['draft', 'sent', 'failed']);

    const result = await repository.findAll({
      send_status: 'sent',
      event_id: fixture.eventId,
      from: '2026-07-23T08:00:00+09:00',
      to: '2026-07-23T10:00:00+09:00',
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.notifications[0]).toMatchObject({
      recipient_count: 3,
      delivery_summary: { total: 3, draft: 1, sent: 1, failed: 1 },
    });
  });

  it('全件draftなら本文と予定時刻を一括更新する', async () => {
    const fixture = await createFixture();

    await expect(
      repository.update({
        notification_id: fixture.notificationId,
        title: '変更後',
        scheduled_at: '2026-07-23T10:00:00+09:00',
        created_user_id: fixture.creatorId,
      })
    ).resolves.toBe('updated');

    const detail = await repository.findById(fixture.notificationId);
    expect(detail).toMatchObject({
      title: '変更後',
      scheduled_at: '2026-07-23T10:00:00+09:00',
      recipient_count: 2,
      delivery_summary: { total: 2, draft: 2 },
    });
  });

  it('対象変更時はToken単位のdraftを再作成する', async () => {
    const fixture = await createFixture();
    const addedUser = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('追加参加者') RETURNING user_id"
    ).first<{ user_id: number }>();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 99, 'S099')"
      ).bind(addedUser!.user_id, fixture.classRoomId),
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'added-token')"
      ).bind(addedUser!.user_id),
    ]);

    await expect(
      repository.update({
        notification_id: fixture.notificationId,
        audience: {
          type: 'class_room',
          class_room_id: fixture.classRoomId,
        },
        scheduled_at: '2026-07-23T09:00:00+09:00',
        created_user_id: fixture.creatorId,
      })
    ).resolves.toBe('updated');

    const detail = await repository.findById(fixture.notificationId);
    expect(detail).toMatchObject({
      related_event_id: null,
      recipient_count: 3,
      audience: { type: 'resolved_recipients', recipient_count: 3 },
      delivery_summary: { total: 3, draft: 3 },
    });
  });

  it('同じ通知を並行更新してもToken単位のdraftを重複させない', async () => {
    const fixture = await createFixture();
    const input = {
      notification_id: fixture.notificationId,
      audience: {
        type: 'class_room' as const,
        class_room_id: fixture.classRoomId,
      },
      scheduled_at: '2026-07-23T10:00:00+09:00',
      created_user_id: fixture.creatorId,
    };

    await Promise.all([repository.update(input), repository.update(input)]);

    const rows = await env.DB.prepare(
      `SELECT firebase_token_id, COUNT(*) AS count
       FROM notification_schedules
       WHERE notification_id = ?
       GROUP BY firebase_token_id`
    )
      .bind(fixture.notificationId)
      .all<{ firebase_token_id: number; count: number }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results.every(row => row.count === 1)).toBe(true);
  });

  it('対象Tokenが更新直前に無効化されても既存draftを保持する', async () => {
    const fixture = await createFixture();
    await env.DB.prepare(
      'UPDATE firebase_tokens SET is_firebase_active = 0'
    ).run();

    await expect(
      repository.update({
        notification_id: fixture.notificationId,
        audience: { type: 'all' },
        scheduled_at: '2026-07-23T10:00:00+09:00',
        created_user_id: fixture.creatorId,
      })
    ).resolves.toBe('no_active_tokens');

    const detail = await repository.findById(fixture.notificationId);
    expect(detail).toMatchObject({
      scheduled_at: '2026-07-23T09:00:00+09:00',
      recipient_count: 2,
      delivery_summary: { total: 2, draft: 2 },
    });
  });

  it('非draftが1件でもあれば更新しない', async () => {
    const fixture = await createFixture(['draft', 'sent']);

    await expect(
      repository.update({
        notification_id: fixture.notificationId,
        title: '変更後',
        created_user_id: fixture.creatorId,
      })
    ).resolves.toBe('not_draft');

    const detail = await repository.findById(fixture.notificationId);
    expect(detail?.title).toBe('変更前');
  });

  it('全件draftなら予定と通知本文を物理削除する', async () => {
    const fixture = await createFixture();

    await expect(repository.deleteDraft(fixture.notificationId)).resolves.toBe(
      'deleted'
    );
    await expect(
      repository.findById(fixture.notificationId)
    ).resolves.toBeNull();
    const notification = await env.DB.prepare(
      'SELECT notification_id FROM notifications WHERE notification_id = ?'
    )
      .bind(fixture.notificationId)
      .first();
    expect(notification).toBeNull();
  });

  it('非draftが1件でもあれば削除しない', async () => {
    const fixture = await createFixture(['draft', 'failed']);

    await expect(repository.deleteDraft(fixture.notificationId)).resolves.toBe(
      'not_draft'
    );
    await expect(
      repository.findById(fixture.notificationId)
    ).resolves.not.toBeNull();
  });
});
