import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMobileNotificationRepository } from '../../../src/infrastructure/repositories/MobileNotificationRepository';

const repository = createMobileNotificationRepository(env.DB);
const oldTime = '2026-07-23T00:00:00.000Z';
const newTime = '2026-07-23T01:00:00.000Z';

async function createUser(name = '本人') {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(name)
    .first<{ user_id: number }>();
  return row!.user_id;
}

async function createToken(userId: number, token = 'mobile-test-token') {
  const row = await env.DB.prepare(
    'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?) RETURNING firebase_token_id'
  )
    .bind(userId, token)
    .first<{ firebase_token_id: number }>();
  return row!.firebase_token_id;
}

async function createNotification(title = '通知') {
  const row = await env.DB.prepare(
    "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('notification_general', 'Pushタイトル', 'Push本文', ?, ?) RETURNING notification_id"
  )
    .bind(title, `${title}本文`)
    .first<{ notification_id: number }>();
  return row!.notification_id;
}

async function createSchedule(
  notificationId: number,
  input: {
    sendAt?: string;
    status?: string;
    eventId?: number;
    tokenId?: number;
  } = {}
) {
  const row = await env.DB.prepare(
    `INSERT INTO notification_schedules
      (notification_id, send_at, send_status, event_id, firebase_token_id)
     VALUES (?, ?, ?, ?, ?) RETURNING notification_schedule_id`
  )
    .bind(
      notificationId,
      input.sendAt ?? oldTime,
      input.status ?? 'completed',
      input.eventId ?? null,
      input.tokenId ?? null
    )
    .first<{ notification_schedule_id: number }>();
  return row!.notification_schedule_id;
}

async function createRecipient(scheduleId: number, userId: number) {
  const row = await env.DB.prepare(
    'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
  )
    .bind(scheduleId, userId)
    .first<{ notification_recipient_id: number }>();
  return row!.notification_recipient_id;
}

async function createDelivery(
  recipientId: number,
  tokenId: number | null,
  status: string,
  attempts = 1
) {
  await env.DB.prepare(
    `INSERT INTO notification_push_deliveries
      (notification_recipient_id, firebase_token_id, platform, status, attempt_count)
     VALUES (?, ?, 2, ?, ?)`
  )
    .bind(recipientId, tokenId, status, attempts)
    .run();
}

const listForUser = (userId: number, limit = 10, offset = 0) =>
  repository.findAllForUser({ userId, limit, offset });

describe('MobileNotificationRepository', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_push_deliveries'),
      env.DB.prepare('DELETE FROM notification_recipients'),
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM event_venues'),
      env.DB.prepare('DELETE FROM venues'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM microsoft_account_links'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it.each([
    { label: 'Tokenあり', tokens: 1, statuses: [] as string[], attempts: 0 },
    { label: 'Token 0件', tokens: 0, statuses: [] as string[], attempts: 0 },
    { label: 'Push失敗', tokens: 1, statuses: ['failed'], attempts: 1 },
    { label: 'Retry最終失敗', tokens: 1, statuses: ['failed'], attempts: 5 },
    {
      label: '一部端末成功',
      tokens: 2,
      statuses: ['sent', 'failed'],
      attempts: 1,
    },
    {
      label: '複数Token成功',
      tokens: 2,
      statuses: ['sent', 'sent'],
      attempts: 1,
    },
  ])(
    '$labelでも本人Recipientがあれば一覧と詳細に1件返す',
    async ({ tokens, statuses, attempts }) => {
      const userId = await createUser();
      const notificationId = await createNotification();
      const scheduleId = await createSchedule(notificationId, {
        status: 'resolving',
      });
      const recipientId = await createRecipient(scheduleId, userId);
      for (let i = 0; i < tokens; i++) {
        const tokenId = await createToken(userId, `mobile-token-${i}`);
        if (statuses[i])
          await createDelivery(recipientId, tokenId, statuses[i], attempts);
      }

      const list = await listForUser(userId);
      expect(list.total).toBe(1);
      expect(list.notifications).toHaveLength(1);
      expect(list.notifications[0]).toEqual({
        id: notificationId,
        type: 'notification_general',
        title: '通知',
        body: '通知本文',
        scheduledAt: oldTime,
        relatedEvent: null,
      });
      expect(await repository.findByIdForUser(notificationId, userId)).toEqual(
        list.notifications[0]
      );
    }
  );

  it('Token削除後も配送実績と本人通知履歴を保持する', async () => {
    const userId = await createUser();
    const tokenId = await createToken(userId);
    const notificationId = await createNotification();
    const recipientId = await createRecipient(
      await createSchedule(notificationId),
      userId
    );
    await createDelivery(recipientId, tokenId, 'failed');
    await env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(tokenId)
      .run();

    expect((await listForUser(userId)).total).toBe(1);
    expect(
      await repository.findByIdForUser(notificationId, userId)
    ).not.toBeNull();
    expect(
      await env.DB.prepare(
        'SELECT firebase_token_id FROM notification_push_deliveries WHERE notification_recipient_id = ?'
      )
        .bind(recipientId)
        .first()
    ).toEqual({ firebase_token_id: null });
  });

  it('本人RecipientがなければToken所有や送信成功だけでは本人履歴へ出さない', async () => {
    const userId = await createUser();
    const otherId = await createUser('他人');
    const tokenId = await createToken(userId);
    const notificationId = await createNotification();
    const scheduleId = await createSchedule(notificationId, {
      tokenId,
      status: 'sent',
    });
    const recipientId = await createRecipient(scheduleId, otherId);
    await createDelivery(recipientId, tokenId, 'sent');
    const unresolvedId = await createNotification('Recipient未確定');
    await createSchedule(unresolvedId, { tokenId, status: 'scheduled' });

    expect(await listForUser(userId)).toEqual({ notifications: [], total: 0 });
    expect(await repository.findByIdForUser(notificationId, userId)).toBeNull();
    expect(await repository.findByIdForUser(unresolvedId, userId)).toBeNull();
    expect(await repository.findByIdForUser(999999, userId)).toBeNull();
  });

  it('複数ScheduleをNotification単位にまとめ、本人の最新send_atを一覧と詳細で使う', async () => {
    const userId = await createUser();
    const otherId = await createUser('他人');
    const notificationId = await createNotification();
    const latestSchedule = await createSchedule(notificationId, {
      sendAt: newTime,
    });
    await createRecipient(latestSchedule, userId);
    // IDが大きくてもsend_atが古いScheduleは表示情報に使わない。
    await createRecipient(await createSchedule(notificationId), userId);
    await createRecipient(
      await createSchedule(notificationId, {
        sendAt: '2026-07-23T02:00:00.000Z',
      }),
      otherId
    );
    await createSchedule(notificationId, {
      sendAt: '2026-07-23T03:00:00.000Z',
      status: 'scheduled',
    });

    const list = await listForUser(userId);
    expect(list.total).toBe(1);
    expect(list.notifications).toHaveLength(1);
    expect(list.notifications[0].scheduledAt).toBe(newTime);
    expect(await repository.findByIdForUser(notificationId, userId)).toEqual(
      list.notifications[0]
    );
  });

  it('新しい順・同時刻はSchedule ID降順で並べ、重複排除後にページングする', async () => {
    const userId = await createUser();
    const oldestId = await createNotification('古い通知');
    await createRecipient(await createSchedule(oldestId), userId);
    const firstId = await createNotification('同時刻1');
    await createRecipient(
      await createSchedule(firstId, { sendAt: newTime }),
      userId
    );
    const secondId = await createNotification('同時刻2');
    await createRecipient(
      await createSchedule(secondId, { sendAt: newTime }),
      userId
    );
    await createRecipient(
      await createSchedule(firstId, { sendAt: newTime }),
      userId
    );

    expect(
      (await listForUser(userId)).notifications.map(item => item.id)
    ).toEqual([firstId, secondId, oldestId]);
    const page = await listForUser(userId, 1, 1);
    expect(page.total).toBe(3);
    expect(page.notifications.map(item => item.id)).toEqual([secondId]);
    expect(await listForUser(userId, 1, 3)).toEqual({
      notifications: [],
      total: 3,
    });
  });

  it('関連競技と会場順を維持し、同時刻なら最新Scheduleの情報を一覧・詳細で使う', async () => {
    const userId = await createUser();
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, start_time, end_time) VALUES ('綱引き', '1030', '1100') RETURNING event_id"
    ).first<{ event_id: number }>();
    const firstVenue = await env.DB.prepare(
      "INSERT INTO venues (venue_name) VALUES ('グラウンド') RETURNING venue_id"
    ).first<{ venue_id: number }>();
    const secondVenue = await env.DB.prepare(
      "INSERT INTO venues (venue_name) VALUES ('第1体育館') RETURNING venue_id"
    ).first<{ venue_id: number }>();
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      ).bind(event!.event_id, secondVenue!.venue_id),
      env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      ).bind(event!.event_id, firstVenue!.venue_id),
    ]);
    const notificationId = await createNotification('競技通知');
    await createRecipient(await createSchedule(notificationId), userId);
    await createRecipient(
      await createSchedule(notificationId, { eventId: event!.event_id }),
      userId
    );

    const list = await listForUser(userId);
    expect(list.notifications[0].relatedEvent).toEqual({
      id: event!.event_id,
      name: '綱引き',
      venues: [
        { venue_id: firstVenue!.venue_id, venue_name: 'グラウンド' },
        { venue_id: secondVenue!.venue_id, venue_name: '第1体育館' },
      ],
      startTime: '1030',
      endTime: '1100',
    });
    expect(await repository.findByIdForUser(notificationId, userId)).toEqual(
      list.notifications[0]
    );
  });

  it('User削除でRecipientとDeliveryがCASCADEされ本人通知履歴から消える', async () => {
    const userId = await createUser();
    const notificationId = await createNotification('削除後に残らない通知');
    const scheduleId = await createSchedule(notificationId);
    const recipientId = await createRecipient(scheduleId, userId);
    await createDelivery(recipientId, null, 'sent');

    expect((await listForUser(userId)).notifications).toHaveLength(1);
    expect(
      await repository.findByIdForUser(notificationId, userId)
    ).not.toBeNull();

    await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
      .bind(userId)
      .run();

    expect(
      await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM notification_recipients WHERE notification_recipient_id = ?'
      )
        .bind(recipientId)
        .first()
    ).toEqual({ total: 0 });
    expect(
      await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM notification_push_deliveries WHERE notification_recipient_id = ?'
      )
        .bind(recipientId)
        .first()
    ).toEqual({ total: 0 });
    expect(await listForUser(userId)).toEqual({
      notifications: [],
      total: 0,
    });
    expect(await repository.findByIdForUser(notificationId, userId)).toBeNull();
  });
});
