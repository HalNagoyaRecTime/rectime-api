import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationScheduleQueryRepository } from '../../../src/infrastructure/repositories/NotificationScheduleQueryRepository';

const repository = createNotificationScheduleQueryRepository(env.DB);

async function createUser(name: string): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(name)
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
               'Detail title', 'Detail body', 'high', ?, ?, ?, ?, ?)
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
  status: string;
  sendAt: string;
  scheduledBy?: number | null;
  recipientsResolvedAt?: string | null;
  stoppedAt?: string | null;
  stoppedBy?: number | null;
  reason?: string | null;
}): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO notification_schedules (
       notification_id, scheduled_by_user_id, send_status, send_at,
       recipients_resolved_at, stopped_at, stopped_by_user_id, reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING notification_schedule_id`
  )
    .bind(
      input.notificationId,
      input.scheduledBy ?? null,
      input.status,
      input.sendAt,
      input.recipientsResolvedAt ?? null,
      input.stoppedAt ?? null,
      input.stoppedBy ?? null,
      input.reason ?? null
    )
    .first<{ notification_schedule_id: number }>();
  if (!row) throw new Error('Scheduleを作成できませんでした');
  return row.notification_schedule_id;
}

async function addRecipient(scheduleId: number, userId: number) {
  const row = await env.DB.prepare(
    `INSERT INTO notification_recipients (notification_schedule_id, user_id)
     VALUES (?, ?) RETURNING notification_recipient_id`
  )
    .bind(scheduleId, userId)
    .first<{ notification_recipient_id: number }>();
  if (!row) throw new Error('Recipientを作成できませんでした');
  return row.notification_recipient_id;
}

async function addToken(userId: number, token: string) {
  const row = await env.DB.prepare(
    `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
     VALUES (?, 2, ?) RETURNING firebase_token_id`
  )
    .bind(userId, token)
    .first<{ firebase_token_id: number }>();
  if (!row) throw new Error('Tokenを作成できませんでした');
  return row.firebase_token_id;
}

async function addDelivery(
  recipientId: number,
  tokenId: number,
  status: string
) {
  await env.DB.prepare(
    `INSERT INTO notification_push_deliveries (
       notification_recipient_id, firebase_token_id, platform, status
     ) VALUES (?, ?, 2, ?)`
  )
    .bind(recipientId, tokenId, status)
    .run();
}

describe('NotificationScheduleQueryRepository', () => {
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

  it('6 Schedule status、stop、期間filterと別々のRecipient/Delivery集計を返す', async () => {
    const creatorId = await createUser('作成者');
    const schedulerId = await createUser('停止操作staff');
    const firstRecipientUserId = await createUser('複数Token利用者');
    const secondRecipientUserId = await createUser('複数Delivery利用者');
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
      createdAt: '2026-07-22T23:00:00.000Z',
    });
    const inRangeScheduleIds: Record<string, number> = {};
    const statuses = [
      'scheduled',
      'resolving',
      'sending',
      'completed',
      'failed',
      'stopped',
    ];
    for (const [index, status] of statuses.entries()) {
      inRangeScheduleIds[status] = await createSchedule({
        notificationId: manualNotificationId,
        status,
        sendAt: `2026-07-23T0${index + 1}:00:00.000Z`,
        scheduledBy: index === 0 ? schedulerId : null,
        recipientsResolvedAt:
          status === 'completed' ? '2026-07-23T06:00:00.000Z' : null,
        stoppedAt: status === 'stopped' ? '2026-07-23T06:01:00.000Z' : null,
        stoppedBy: status === 'stopped' ? schedulerId : null,
        reason: status === 'stopped' ? 'manual' : null,
      });
    }
    const outOfRangeScheduleId = await createSchedule({
      notificationId: manualNotificationId,
      status: 'scheduled',
      sendAt: '2026-07-22T22:00:00.000Z',
    });

    const sendingScheduleId = inRangeScheduleIds.sending!;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO notification_audiences
           (notification_schedule_id, audience_type, target_id, resolved_at)
         VALUES (?, 'event', ?, '2026-07-23T01:00:00.000Z')`
      ).bind(sendingScheduleId, event!.event_id),
      env.DB.prepare(
        `INSERT INTO notification_audiences
           (notification_schedule_id, audience_type, resolved_at)
         VALUES (?, 'all', '2026-07-23T01:00:00.000Z')`
      ).bind(sendingScheduleId),
      env.DB.prepare(
        `INSERT INTO notification_audiences
           (notification_schedule_id, audience_type, target_id)
         VALUES (?, 'gathering', ?)`
      ).bind(sendingScheduleId, gathering!.gathering_id),
    ]);
    const firstRecipientId = await addRecipient(
      sendingScheduleId,
      firstRecipientUserId
    );
    const secondRecipientId = await addRecipient(
      sendingScheduleId,
      secondRecipientUserId
    );
    const tokenIds = await Promise.all([
      addToken(firstRecipientUserId, 'recipient-token-1'),
      addToken(firstRecipientUserId, 'recipient-token-2'),
      addToken(secondRecipientUserId, 'recipient-token-3'),
      addToken(secondRecipientUserId, 'recipient-token-4'),
    ]);
    await Promise.all([
      addDelivery(firstRecipientId, tokenIds[0]!, 'retry_wait'),
      addDelivery(firstRecipientId, tokenIds[1]!, 'sent'),
      addDelivery(secondRecipientId, tokenIds[2]!, 'failed'),
      addDelivery(secondRecipientId, tokenIds[3]!, 'stopped'),
    ]);

    const automaticNotificationId = await createNotification({
      creatorId: null,
      createdAt: '2026-07-23T01:00:00.000Z',
      source: { id: gathering!.gathering_id, hash: 'deleted-source-1' },
    });
    const automaticScheduleId = await createSchedule({
      notificationId: automaticNotificationId,
      status: 'stopped',
      sendAt: '2026-07-24T02:00:00.000Z',
      stoppedAt: '2026-07-24T02:01:00.000Z',
      reason: 'source_deleted',
    });
    await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
      .bind(gathering!.gathering_id)
      .run();

    const listed = await repository.findAll({
      from: '2026-07-23T00:00:00Z',
      to: '2026-07-23T23:59:59Z',
    });
    expect(listed).toHaveLength(6);
    expect(listed.map(schedule => schedule.status)).toEqual(statuses);
    expect(
      listed.find(
        schedule => schedule.notification_schedule_id === outOfRangeScheduleId
      )
    ).toBeUndefined();
    expect(
      listed.find(schedule => schedule.status === 'stopped')?.stop
    ).toMatchObject({
      reason: 'manual',
      stopped_by: { user_id: schedulerId, user_name: '停止操作staff' },
    });
    expect(listed[0]).not.toHaveProperty('audience_progress');
    expect(listed[0]).not.toHaveProperty('delivery_progress');

    const sending = await repository.findById(sendingScheduleId);
    expect(sending).toMatchObject({
      recipient_progress: { count: 2, status: 'pending' },
      audience_progress: { total_count: 3, resolved_count: 2 },
      delivery_progress: {
        total_count: 4,
        pending_count: 0,
        sending_count: 0,
        retry_wait_count: 1,
        sent_count: 1,
        failed_count: 1,
        stopped_count: 1,
      },
    });
    expect(sending?.status).toBe('sending');

    const completed = await repository.findById(inRangeScheduleIds.completed!);
    expect(completed).toMatchObject({
      recipient_progress: { count: 0, status: 'resolved' },
      delivery_progress: {
        total_count: 0,
        pending_count: 0,
        retry_wait_count: 0,
      },
    });

    const automatic = await repository.findById(automaticScheduleId);
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
      stop: { reason: 'source_deleted', stopped_by: null },
    });

    const listSpy = vi.spyOn(env.DB, 'prepare');
    await repository.findAll({
      from: '2026-07-23T00:00:00Z',
      to: '2026-07-23T23:59:59Z',
    });
    expect(listSpy).toHaveBeenCalledTimes(1);
    listSpy.mockRestore();

    const detailSpy = vi.spyOn(env.DB, 'prepare');
    await repository.findById(sendingScheduleId);
    expect(detailSpy).toHaveBeenCalledTimes(1);
    detailSpy.mockRestore();
  });

  it('存在しないScheduleをnullで返す', async () => {
    await expect(repository.findById(999999)).resolves.toBeNull();
  });
});
