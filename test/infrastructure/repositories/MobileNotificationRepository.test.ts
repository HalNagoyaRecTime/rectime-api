import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMobileNotificationRepository } from '../../../src/infrastructure/repositories/MobileNotificationRepository';

describe('MobileNotificationRepository', () => {
  const repository = createMobileNotificationRepository(env.DB);

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM microsoft_account_links'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  async function createUserWithToken(name: string, token: string) {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(name)
      .first<{ user_id: number }>();
    const firebaseToken = await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?) RETURNING firebase_token_id'
    )
      .bind(user!.user_id, token)
      .first<{ firebase_token_id: number }>();
    return {
      userId: user!.user_id,
      firebaseTokenId: firebaseToken!.firebase_token_id,
    };
  }

  async function createNotificationSchedule(input: {
    firebaseTokenId: number;
    title: string;
    sendAt: string;
    sendStatus: 'draft' | 'sending' | 'sent' | 'failed';
    eventId?: number;
  }) {
    const notification = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, title, body) VALUES ('manual', ?, ?) RETURNING notification_id"
    )
      .bind(input.title, `${input.title}本文`)
      .first<{ notification_id: number }>();
    await env.DB.prepare(
      `INSERT INTO notification_schedules
        (notification_id, firebase_token_id, event_id, send_status, send_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(
        notification!.notification_id,
        input.firebaseTokenId,
        input.eventId ?? null,
        input.sendStatus,
        input.sendAt
      )
      .run();
    return notification!.notification_id;
  }

  it('本人へ送信済みの通知だけを新しい順で返す', async () => {
    const mine = await createUserWithToken('本人', 'token-mine');
    const other = await createUserWithToken('他人', 'token-other');
    await createNotificationSchedule({
      firebaseTokenId: mine.firebaseTokenId,
      title: '古い通知',
      sendAt: '2026-07-23T09:00:00+09:00',
      sendStatus: 'sent',
    });
    await createNotificationSchedule({
      firebaseTokenId: mine.firebaseTokenId,
      title: '新しい通知',
      sendAt: '2026-07-23T10:00:00+09:00',
      sendStatus: 'sent',
    });
    await createNotificationSchedule({
      firebaseTokenId: mine.firebaseTokenId,
      title: '未送信通知',
      sendAt: '2026-07-23T11:00:00+09:00',
      sendStatus: 'draft',
    });
    await createNotificationSchedule({
      firebaseTokenId: other.firebaseTokenId,
      title: '他人の通知',
      sendAt: '2026-07-23T12:00:00+09:00',
      sendStatus: 'sent',
    });

    const result = await repository.findAllForUser({
      userId: mine.userId,
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.notifications.map(item => item.title)).toEqual([
      '新しい通知',
      '古い通知',
    ]);
  });

  it('関連競技を一覧と詳細へ含める', async () => {
    const mine = await createUserWithToken('本人', 'token-mine');
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('綱引き', 'グラウンド', '1030', '1100') RETURNING event_id"
    ).first<{ event_id: number }>();
    const notificationId = await createNotificationSchedule({
      firebaseTokenId: mine.firebaseTokenId,
      title: '競技通知',
      sendAt: '2026-07-23T10:15:00+09:00',
      sendStatus: 'sent',
      eventId: event!.event_id,
    });

    const list = await repository.findAllForUser({
      userId: mine.userId,
      limit: 10,
      offset: 0,
    });
    const detail = await repository.findByIdForUser(
      notificationId,
      mine.userId
    );

    expect(list.notifications[0].relatedEvent).toEqual({
      id: event!.event_id,
      name: '綱引き',
      venue: 'グラウンド',
      startTime: '1030',
      endTime: '1100',
    });
    expect(detail).toEqual(list.notifications[0]);
  });

  it('イベントなしの手動通知ではrelated_eventをnullにする', async () => {
    const mine = await createUserWithToken('本人', 'token-mine');
    const notificationId = await createNotificationSchedule({
      firebaseTokenId: mine.firebaseTokenId,
      title: '全体通知',
      sendAt: '2026-07-23T09:00:00+09:00',
      sendStatus: 'sent',
    });

    await expect(
      repository.findByIdForUser(notificationId, mine.userId)
    ).resolves.toMatchObject({ relatedEvent: null });
  });

  it('他人宛てまたは未送信の通知詳細を返さない', async () => {
    const mine = await createUserWithToken('本人', 'token-mine');
    const other = await createUserWithToken('他人', 'token-other');
    const otherNotificationId = await createNotificationSchedule({
      firebaseTokenId: other.firebaseTokenId,
      title: '他人の通知',
      sendAt: '2026-07-23T09:00:00+09:00',
      sendStatus: 'sent',
    });
    const draftNotificationId = await createNotificationSchedule({
      firebaseTokenId: mine.firebaseTokenId,
      title: '未送信通知',
      sendAt: '2026-07-23T10:00:00+09:00',
      sendStatus: 'draft',
    });

    await expect(
      repository.findByIdForUser(otherNotificationId, mine.userId)
    ).resolves.toBeNull();
    await expect(
      repository.findByIdForUser(draftNotificationId, mine.userId)
    ).resolves.toBeNull();
  });

  it('limitとoffsetを一覧へ反映する', async () => {
    const mine = await createUserWithToken('本人', 'token-mine');
    for (const [title, sendAt] of [
      ['通知1', '2026-07-23T09:00:00+09:00'],
      ['通知2', '2026-07-23T10:00:00+09:00'],
      ['通知3', '2026-07-23T11:00:00+09:00'],
    ]) {
      await createNotificationSchedule({
        firebaseTokenId: mine.firebaseTokenId,
        title,
        sendAt,
        sendStatus: 'sent',
      });
    }

    const result = await repository.findAllForUser({
      userId: mine.userId,
      limit: 1,
      offset: 1,
    });

    expect(result.total).toBe(3);
    expect(result.notifications.map(item => item.title)).toEqual(['通知2']);
  });
});
