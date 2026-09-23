import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationScheduleRepository } from '../../../src/infrastructure/repositories/NotificationScheduleRepository';

describe('NotificationScheduleRepository', () => {
  const repository = createNotificationScheduleRepository(env.DB);

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

  async function createFixture(sendAt = '2026-07-23T09:00:00.000Z') {
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('通知予定ユーザー') RETURNING user_id"
    ).first<{ user_id: number }>();
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('大縄跳び', '体育館', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    const token = await env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'token-a') RETURNING firebase_token_id"
    )
      .bind(user!.user_id)
      .first<{ firebase_token_id: number }>();
    const notification = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('manual', '件名', '本文', '件名', '本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    const schedule = await env.DB.prepare(
      `INSERT INTO notification_schedules
       (created_user_id, event_id, notification_id, firebase_token_id, importance, send_status, send_at)
       VALUES (?, ?, ?, ?, 2, 'draft', ?) RETURNING notification_schedule_id`
    )
      .bind(
        user!.user_id,
        event!.event_id,
        notification!.notification_id,
        token!.firebase_token_id,
        sendAt
      )
      .first<{ notification_schedule_id: number }>();
    if (!schedule)
      throw new Error('通知予定のテストデータを作成できませんでした');
    return { user, event, token, notification, schedule };
  }

  function readSchedule(scheduleId: number) {
    return env.DB.prepare(
      'SELECT * FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(scheduleId)
      .first();
  }

  it('対象競技のevent_reminderのdraftだけを取得する', async () => {
    const { user, event, token } = await createFixture();
    const reminder = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('event_reminder', '競技通知', '集合してください', '競技通知', '集合してください') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    const otherEvent = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('別競技', '体育館', '1000', '1100') RETURNING event_id"
    ).first<{ event_id: number }>();
    for (const [eventId, status] of [
      [event!.event_id, 'draft'],
      [event!.event_id, 'sending'],
      [event!.event_id, 'sent'],
      [event!.event_id, 'failed'],
      [otherEvent!.event_id, 'draft'],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO notification_schedules
         (created_user_id, event_id, notification_id, firebase_token_id, importance, send_at, send_status)
         VALUES (?, ?, ?, ?, 2, '2026-07-23T09:00:00.000Z', ?)`
      )
        .bind(
          user!.user_id,
          eventId,
          reminder!.notification_id,
          token!.firebase_token_id,
          status
        )
        .run();
    }

    await expect(
      repository.findDraftsByEvent(event!.event_id)
    ).resolves.toEqual([
      expect.objectContaining({
        event_id: event!.event_id,
        notification_id: reminder!.notification_id,
        firebase_token_id: token!.firebase_token_id,
        notification_type: 'event_reminder',
        title: '競技通知',
        body: '集合してください',
        send_status: 'draft',
      }),
    ]);
    await expect(repository.findDraftsByEvent(999999)).resolves.toEqual([]);
  });

  it.each(['sent', 'failed'] as const)(
    '確保済みの予定だけを%sに更新し、完了した状態を上書きしない',
    async status => {
      const { schedule } = await createFixture();
      const id = schedule.notification_schedule_id;
      const finish = () =>
        status === 'sent'
          ? repository.markSent(id, 'fcm-message-id')
          : repository.markFailed(id, '配信に失敗しました');

      await finish();
      await expect(readSchedule(id)).resolves.toMatchObject({
        send_status: 'draft',
      });
      await repository.claimForDelivery(
        [id],
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z'
      );
      await finish();
      const finished = await readSchedule(id);
      expect(finished).toMatchObject({
        send_status: status,
        fcm_message_id: status === 'sent' ? 'fcm-message-id' : null,
        failed_reason: status === 'failed' ? '配信に失敗しました' : null,
      });

      await repository.markSent(id, '別のメッセージID');
      await repository.markFailed(id, '別のエラー');
      await expect(readSchedule(id)).resolves.toEqual(finished);
    }
  );

  it('期限到来したdraftをQueue登録候補として取得する', async () => {
    const { schedule } = await createFixture();
    await expect(
      repository.findDeliveryCandidateIds(
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z',
        5000
      )
    ).resolves.toEqual([schedule.notification_schedule_id]);
    await expect(
      readSchedule(schedule.notification_schedule_id)
    ).resolves.toMatchObject({ send_status: 'draft' });
  });

  it('TokenがNULLのScheduleはEntityで表現し、送信候補・claim対象にしない', async () => {
    const { event, schedule } = await createFixture();
    await env.DB.prepare(
      "UPDATE notifications SET notification_type = 'event_reminder' WHERE notification_id = (SELECT notification_id FROM notification_schedules WHERE notification_schedule_id = ?)"
    )
      .bind(schedule.notification_schedule_id)
      .run();
    await env.DB.prepare(
      'UPDATE notification_schedules SET firebase_token_id = NULL WHERE notification_schedule_id = ?'
    )
      .bind(schedule.notification_schedule_id)
      .run();

    const drafts = await repository.findDraftsByEvent(event!.event_id);
    expect(drafts).toEqual([
      expect.objectContaining({
        notification_schedule_id: schedule.notification_schedule_id,
        firebase_token_id: null,
        send_status: 'draft',
      }),
    ]);
    await expect(
      repository.findDeliveryCandidateIds(
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z',
        5000
      )
    ).resolves.toEqual([]);

    await expect(
      repository.claimForDelivery(
        [schedule.notification_schedule_id],
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z'
      )
    ).resolves.toEqual([]);
    await expect(
      readSchedule(schedule.notification_schedule_id)
    ).resolves.toMatchObject({
      firebase_token_id: null,
      send_status: 'draft',
    });
  });

  it('指定されたdraftをtoken情報付きで一度だけ確保する', async () => {
    const { schedule } = await createFixture();
    const first = await repository.claimForDelivery(
      [schedule.notification_schedule_id],
      '2026-07-23T09:05:00.000Z',
      '2026-07-23T09:01:00.000Z'
    );
    const second = await repository.claimForDelivery(
      [schedule.notification_schedule_id],
      '2026-07-23T09:05:00.000Z',
      '2026-07-23T09:01:00.000Z'
    );

    expect(first).toEqual([
      expect.objectContaining({
        notification_schedule_id: schedule.notification_schedule_id,
        fcm_token: 'token-a',
        is_firebase_active: 1,
        is_user_live_active: 1,
        send_status: 'sending',
      }),
    ]);
    expect(second).toEqual([]);
  });

  it('宛先Userが無効化済みなら確保した予定にその状態を含める', async () => {
    const { user, schedule } = await createFixture();
    await env.DB.prepare(
      'UPDATE users SET is_live_active = 0 WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .run();

    const claimed = await repository.claimForDelivery(
      [schedule.notification_schedule_id],
      '2026-07-23T09:05:00.000Z',
      '2026-07-23T09:01:00.000Z'
    );

    expect(claimed).toEqual([
      expect.objectContaining({
        notification_schedule_id: schedule.notification_schedule_id,
        is_firebase_active: 1,
        is_user_live_active: 0,
        send_status: 'sending',
      }),
    ]);
  });

  it('並行するQueue messageでも同じ予定を重複確保しない', async () => {
    const { schedule } = await createFixture();
    const claims = await Promise.all([
      repository.claimForDelivery(
        [schedule.notification_schedule_id],
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z'
      ),
      repository.claimForDelivery(
        [schedule.notification_schedule_id],
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z'
      ),
    ]);

    expect(claims.flat()).toHaveLength(1);
  });

  it('Queue登録後に未来へ変更された予定は確保しない', async () => {
    const { schedule } = await createFixture('2026-07-23T10:00:00.000Z');

    await expect(
      repository.claimForDelivery(
        [schedule.notification_schedule_id],
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z'
      )
    ).resolves.toEqual([]);
  });

  it('lease期限を過ぎたsendingを再取得して復旧する', async () => {
    const { schedule } = await createFixture();
    await env.DB.prepare(
      `UPDATE notification_schedules
       SET send_status = 'sending', updated_at = '2026-07-23 08:50:00'
       WHERE notification_schedule_id = ?`
    )
      .bind(schedule.notification_schedule_id)
      .run();

    await expect(
      repository.findDeliveryCandidateIds(
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z',
        5000
      )
    ).resolves.toEqual([schedule.notification_schedule_id]);
    await expect(
      repository.claimForDelivery(
        [schedule.notification_schedule_id],
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z'
      )
    ).resolves.toEqual([
      expect.objectContaining({
        notification_schedule_id: schedule.notification_schedule_id,
        send_status: 'sending',
      }),
    ]);
  });

  it('lease期間内のsendingはQueue登録候補にしない', async () => {
    const { schedule } = await createFixture();
    await env.DB.prepare(
      `UPDATE notification_schedules
       SET send_status = 'sending', updated_at = '2026-07-23 09:04:00'
       WHERE notification_schedule_id = ?`
    )
      .bind(schedule.notification_schedule_id)
      .run();

    await expect(
      repository.findDeliveryCandidateIds(
        '2026-07-23T09:05:00.000Z',
        '2026-07-23T09:01:00.000Z',
        5000
      )
    ).resolves.toEqual([]);
  });

  describe('anonymizeCreatedUserId', () => {
    it('created_user_idをNULL化し、通知予定自体は残す', async () => {
      const { user, schedule } = await createFixture();

      await repository.anonymizeCreatedUserId(user!.user_id);

      const found = await readSchedule(schedule.notification_schedule_id);
      expect(found).not.toBeNull();
      expect(found?.created_user_id).toBeNull();
    });

    it('該当する通知予定が無くてもエラーにならない(冪等)', async () => {
      await expect(
        repository.anonymizeCreatedUserId(999999)
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteByFirebaseTokenId', () => {
    it('指定firebase_token_idに紐づく通知予定を物理削除する', async () => {
      const { token, schedule } = await createFixture();

      await repository.deleteByFirebaseTokenId(token!.firebase_token_id);

      await expect(
        readSchedule(schedule.notification_schedule_id)
      ).resolves.toBeNull();
    });

    it('該当する通知予定が無くてもエラーにならない(冪等)', async () => {
      await expect(
        repository.deleteByFirebaseTokenId(999999)
      ).resolves.toBeUndefined();
    });
  });
});
