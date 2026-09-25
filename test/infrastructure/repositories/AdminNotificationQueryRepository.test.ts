import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminNotificationQueryRepository } from '../../../src/infrastructure/repositories/AdminNotificationQueryRepository';

const repository = createAdminNotificationQueryRepository(env.DB);

async function createUser(userName: string): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  if (!row) throw new Error('ユーザーを作成できませんでした');
  return row.user_id;
}

async function createNotification(input: {
  creatorId: number | null;
  createdAt: string;
  source?: { id: number; hash: string };
}): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO notifications (
       created_by_user_id, push_title, push_body, notification_type,
       title, body, importance, source_type, source_id, source_hash,
       created_at, updated_at
     ) VALUES (?, 'Push title', 'Push body', 'notification_general',
               'Detail title', 'Detail body', 'normal', ?, ?, ?, ?, ?)
     RETURNING notification_id`
  )
    .bind(
      input.creatorId,
      input.source ? 'gathering' : null,
      input.source?.id ?? null,
      input.source?.hash ?? null,
      input.createdAt,
      input.createdAt
    )
    .first<{ notification_id: number }>();
  if (!row) throw new Error('通知を作成できませんでした');
  return row.notification_id;
}

async function createSchedule(input: {
  notificationId: number;
  scheduledBy: number | null;
  status: string;
  sendAt: string;
  createdAt: string;
  resolvedAt?: string | null;
  stoppedAt?: string | null;
  stoppedBy?: number | null;
  reason?: string | null;
}): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO notification_schedules (
       notification_id, scheduled_by_user_id, send_status, send_at,
       recipients_resolved_at, stopped_at, stopped_by_user_id, reason,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING notification_schedule_id`
  )
    .bind(
      input.notificationId,
      input.scheduledBy,
      input.status,
      input.sendAt,
      input.resolvedAt ?? null,
      input.stoppedAt ?? null,
      input.stoppedBy ?? null,
      input.reason ?? null,
      input.createdAt,
      input.createdAt
    )
    .first<{ notification_schedule_id: number }>();
  if (!row) throw new Error('スケジュールを作成できませんでした');
  return row.notification_schedule_id;
}

async function addRecipient(
  scheduleId: number,
  userId: number
): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO notification_recipients (notification_schedule_id, user_id)
     VALUES (?, ?) RETURNING notification_recipient_id`
  )
    .bind(scheduleId, userId)
    .first<{ notification_recipient_id: number }>();
  if (!row) throw new Error('Recipientを作成できませんでした');
  return row.notification_recipient_id;
}

async function addToken(userId: number, token: string): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
     VALUES (?, 2, ?) RETURNING firebase_token_id`
  )
    .bind(userId, token)
    .first<{ firebase_token_id: number }>();
  if (!row) throw new Error('Tokenを作成できませんでした');
  return row.firebase_token_id;
}

async function addDelivery(input: {
  recipientId: number;
  tokenId: number;
  status: string;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notification_push_deliveries (
       notification_recipient_id, firebase_token_id, platform, status
     ) VALUES (?, ?, 2, ?)`
  )
    .bind(input.recipientId, input.tokenId, input.status)
    .run();
}

describe('AdminNotificationQueryRepository', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM class_rooms'),
      env.DB.prepare('DELETE FROM event_venues'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('manual / automatic通知、1:N Schedule、source削除、Recipient単位のsummaryを返す', async () => {
    const creatorId = await createUser('管理者');
    const schedulerId = await createUser('予約者');
    const sentUserId = await createUser('送信成功と失敗の利用者');
    const failedUserId = await createUser('失敗利用者');
    const noTokenUserId = await createUser('Tokenなし利用者');
    const event = await env.DB.prepare(
      `INSERT INTO events (event_name, start_time, end_time)
       VALUES ('男子100m', '1000', '1030') RETURNING event_id`
    ).first<{ event_id: number }>();
    const spot = await env.DB.prepare(
      `INSERT INTO gathering_spots (gathering_spot_name)
       VALUES ('第一集合') RETURNING gathering_spot_id`
    ).first<{ gathering_spot_id: number }>();
    const gathering = await env.DB.prepare(
      `INSERT INTO gatherings (event_id, gathering_spot_id)
       VALUES (?, ?) RETURNING gathering_id`
    )
      .bind(event!.event_id, spot!.gathering_spot_id)
      .first<{ gathering_id: number }>();

    const manualNotificationId = await createNotification({
      creatorId,
      createdAt: '2026-07-23T01:00:00.000Z',
    });
    const firstScheduleId = await createSchedule({
      notificationId: manualNotificationId,
      scheduledBy: schedulerId,
      status: 'completed',
      sendAt: '2026-07-23T02:00:00.000Z',
      createdAt: '2026-07-23T01:01:00.000Z',
      resolvedAt: '2026-07-23T01:02:00.000Z',
    });
    const secondScheduleId = await createSchedule({
      notificationId: manualNotificationId,
      scheduledBy: null,
      status: 'stopped',
      sendAt: '2026-07-23T03:00:00.000Z',
      createdAt: '2026-07-23T01:03:00.000Z',
      stoppedAt: '2026-07-23T01:04:00.000Z',
      stoppedBy: schedulerId,
      reason: 'manual',
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO notification_audiences
           (notification_schedule_id, audience_type, target_id, resolved_at)
         VALUES (?, 'event', ?, '2026-07-23T01:02:00.000Z')`
      ).bind(firstScheduleId, event!.event_id),
      env.DB.prepare(
        `INSERT INTO notification_audiences
           (notification_schedule_id, audience_type, target_id)
         VALUES (?, 'all', NULL)`
      ).bind(secondScheduleId),
    ]);

    const successRecipientId = await addRecipient(firstScheduleId, sentUserId);
    const failedRecipientId = await addRecipient(firstScheduleId, failedUserId);
    await addRecipient(firstScheduleId, noTokenUserId);
    const sentTokenId = await addToken(sentUserId, 'sent-token');
    const secondSentUserTokenId = await addToken(
      sentUserId,
      'second-sent-token'
    );
    const failedTokenId = await addToken(failedUserId, 'failed-token');
    await Promise.all([
      addDelivery({
        recipientId: successRecipientId,
        tokenId: sentTokenId,
        status: 'sent',
      }),
      addDelivery({
        recipientId: successRecipientId,
        tokenId: secondSentUserTokenId,
        status: 'failed',
      }),
      addDelivery({
        recipientId: failedRecipientId,
        tokenId: failedTokenId,
        status: 'retry_wait',
      }),
    ]);

    const automaticNotificationId = await createNotification({
      creatorId: null,
      createdAt: '2026-07-24T01:00:00.000Z',
      source: { id: gathering!.gathering_id, hash: 'source-deleted-1' },
    });
    const automaticScheduleId = await createSchedule({
      notificationId: automaticNotificationId,
      scheduledBy: null,
      status: 'stopped',
      sendAt: '2026-07-24T02:00:00.000Z',
      createdAt: '2026-07-24T01:01:00.000Z',
      stoppedAt: '2026-07-24T01:02:00.000Z',
      reason: 'source_deleted',
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO notification_audiences
           (notification_schedule_id, audience_type, target_id)
         VALUES (?, 'gathering', ?)`
      ).bind(automaticScheduleId, gathering!.gathering_id),
      env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?').bind(
        gathering!.gathering_id
      ),
    ]);

    const manual = await repository.findById(manualNotificationId);
    expect(manual).toMatchObject({
      notification_id: manualNotificationId,
      creation: {
        method: 'manual',
        user: { user_id: creatorId, user_name: '管理者' },
        source: null,
      },
      schedules: [
        {
          notification_schedule_id: firstScheduleId,
          scheduled_by: { user_id: schedulerId, user_name: '予約者' },
          audience: {
            items: [
              {
                type: 'event',
                target_id: event!.event_id,
                label: '男子100m',
              },
            ],
            recipient_resolution: { status: 'resolved', resolved_count: 3 },
          },
          recipient_push_summary: {
            total_count: 3,
            success_count: 1,
            failed_count: 1,
            no_push_target_count: 1,
          },
        },
        {
          notification_schedule_id: secondScheduleId,
          status: 'stopped',
          stop: {
            reason: 'manual',
            stopped_at: '2026-07-23T01:04:00.000Z',
            stopped_by: { user_id: schedulerId, user_name: '予約者' },
          },
        },
      ],
    });
    expect(manual?.schedules).toHaveLength(2);

    const automatic = await repository.findById(automaticNotificationId);
    expect(automatic).toMatchObject({
      creation: {
        method: 'automatic',
        user: null,
        source: {
          type: 'gathering',
          id: gathering!.gathering_id,
          label: null,
        },
      },
      schedules: [
        {
          stop: {
            reason: 'source_deleted',
            stopped_by: null,
          },
          audience: {
            items: [
              {
                type: 'gathering',
                target_id: gathering!.gathering_id,
                label: null,
              },
            ],
          },
        },
      ],
    });

    const listed = await repository.findAll({
      from: '2026-07-23T00:00:00+09:00',
      to: '2026-07-23T23:59:59+09:00',
    });
    expect(listed.map(notification => notification.notification_id)).toEqual([
      manualNotificationId,
    ]);

    const batchSpy = vi.spyOn(env.DB, 'batch');
    await repository.findAll({
      from: '2026-07-23T00:00:00+09:00',
      to: '2026-07-24T23:59:59+09:00',
    });
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0]?.[0]).toHaveLength(4);
    batchSpy.mockRestore();
  });

  it('存在しないIDと対象Scheduleのない一覧を空結果として返す', async () => {
    await expect(repository.findById(999999)).resolves.toBeNull();
    await expect(
      repository.findAll({
        from: '2026-07-23T00:00:00+09:00',
        to: '2026-07-23T23:59:59+09:00',
      })
    ).resolves.toEqual([]);
  });

  it('一覧期間をScheduleのsend_atで判定し、期間内Scheduleだけを返す', async () => {
    const startBoundaryNotificationId = await createNotification({
      creatorId: null,
      createdAt: '2026-07-22T12:00:00+09:00',
    });
    const startBoundaryScheduleId = await createSchedule({
      notificationId: startBoundaryNotificationId,
      scheduledBy: null,
      status: 'scheduled',
      sendAt: '2026-07-23T00:00:00+09:00',
      createdAt: '2026-07-22T12:01:00+09:00',
    });

    const excludedNotificationId = await createNotification({
      creatorId: null,
      createdAt: '2026-07-23T10:00:00+09:00',
    });
    await createSchedule({
      notificationId: excludedNotificationId,
      scheduledBy: null,
      status: 'scheduled',
      sendAt: '2026-07-24T00:00:00+09:00',
      createdAt: '2026-07-23T10:01:00+09:00',
    });

    const mixedScheduleNotificationId = await createNotification({
      creatorId: null,
      createdAt: '2026-07-22T13:00:00+09:00',
    });
    const endBoundaryScheduleId = await createSchedule({
      notificationId: mixedScheduleNotificationId,
      scheduledBy: null,
      status: 'scheduled',
      sendAt: '2026-07-23T23:59:59+09:00',
      createdAt: '2026-07-22T13:01:00+09:00',
    });
    await createSchedule({
      notificationId: mixedScheduleNotificationId,
      scheduledBy: null,
      status: 'scheduled',
      sendAt: '2026-07-24T00:00:00+09:00',
      createdAt: '2026-07-22T13:02:00+09:00',
    });

    const listed = await repository.findAll({
      from: '2026-07-23T00:00:00+09:00',
      to: '2026-07-23T23:59:59+09:00',
    });

    expect(listed.map(notification => notification.notification_id)).toEqual([
      mixedScheduleNotificationId,
      startBoundaryNotificationId,
    ]);
    expect(listed[0]?.schedules).toHaveLength(1);
    expect(listed[0]?.schedules[0]?.notification_schedule_id).toBe(
      endBoundaryScheduleId
    );
    expect(listed[0]?.schedules[0]?.send_at).toBe('2026-07-23T23:59:59+09:00');
    expect(
      listed[1]?.schedules.map(schedule => schedule.notification_schedule_id)
    ).toEqual([startBoundaryScheduleId]);
  });
});
