import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationDeliveryService } from '../../../src/application/services/NotificationDeliveryService';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';
import { clearNotificationFixtures } from '../../notificationDeliveryFixtures';
import { createReadCountingDb } from '../../readCountingDb';

const NOW = '2026-11-27T01:00:00.000Z';
const TARGET_RECIPIENTS = 50;
const OTHER_RECIPIENTS = 1000;
const TARGET_SENT_RECIPIENTS = 1000;
const MAX_ROWS_READ_TO_SEND = TARGET_RECIPIENTS * 60;
const MAX_ROWS_READ_TO_FAIL = TARGET_RECIPIENTS * 10;
const MAX_ROWS_READ_TO_CHECK = 60;

async function insertSendingSchedule(
  actorUserId: number,
  pendingCount: number,
  sentCount = 0
) {
  const recipientCount = pendingCount + sentCount;
  const { notification_schedule_id: scheduleId } =
    await createAdminNotificationCommandRepository(env.DB).create({
      actor_user_id: actorUserId,
      push_title: '出席確認',
      push_body: '本文',
      detail_title: '詳細',
      detail_body: '詳細本文',
      importance: 'normal',
      send_at: NOW,
      audiences: [{ type: 'user', target_id: actorUserId }],
      now: NOW,
    });
  const prefix = `reads-${scheduleId}-`;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE notification_schedules
       SET send_status = 'sending', recipients_resolved_at = ?
       WHERE notification_schedule_id = ?`
    ).bind(NOW, scheduleId),
    env.DB.prepare(
      `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
       INSERT INTO users (user_name, is_live_active) SELECT ? || n, 1 FROM seq`
    ).bind(recipientCount, prefix),
    env.DB.prepare(
      `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
       SELECT user_id, 1, 'token-' || user_id FROM users WHERE user_name LIKE ? || '%'`
    ).bind(prefix),
    env.DB.prepare(
      `INSERT INTO notification_recipients (notification_schedule_id, user_id)
       SELECT ?, user_id FROM users WHERE user_name LIKE ? || '%'`
    ).bind(scheduleId, prefix),
    env.DB.prepare(
      `INSERT INTO notification_push_deliveries (
         notification_recipient_id, firebase_token_id, platform, status
       )
       SELECT r.notification_recipient_id, t.firebase_token_id, t.platform,
              CASE WHEN row_number() OVER (ORDER BY r.notification_recipient_id) <= ?
                THEN 'sent' ELSE 'pending' END
       FROM notification_recipients r
       JOIN firebase_tokens t ON t.user_id = r.user_id
       WHERE r.notification_schedule_id = ?`
    ).bind(sentCount, scheduleId),
  ]);
  return scheduleId;
}

describe('送信済みの配信と、配信中のほかの予約があるときの通知配信のD1読み取り行数', () => {
  let targetScheduleId: number;

  beforeEach(async () => {
    await clearNotificationFixtures();
    const actor = await env.DB.prepare(
      "INSERT INTO users (user_name, is_live_active) VALUES ('配信するスタッフ', 1) RETURNING user_id"
    ).first<{ user_id: number }>();
    if (!actor) throw new Error('Userの作成に失敗しました');
    await insertSendingSchedule(actor.user_id, OTHER_RECIPIENTS);
    targetScheduleId = await insertSendingSchedule(
      actor.user_id,
      TARGET_RECIPIENTS,
      TARGET_SENT_RECIPIENTS
    );
  });

  it('Queueの1メッセージ分の配信は、その予約の未送信の配信数に比例した行数しか読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();
    const service = createNotificationDeliveryService({
      notificationDeliveryRepository: createNotificationDeliveryRepository(db),
      firebaseTokenRepository: createFirebaseTokenRepository(db),
      notificationDeliveryQueue: { enqueueMany: vi.fn() },
      fcmService: {
        sendNotificationToToken: vi.fn(async () => ({
          success: true as const,
          messageId: 'projects/test/messages/1',
        })),
      },
    });

    const result = await service.sendQueuedNotifications(
      [targetScheduleId],
      new Date(NOW)
    );

    expect(result).toEqual({
      claimed: TARGET_RECIPIENTS,
      sent: TARGET_RECIPIENTS,
      failed: 0,
    });
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_SEND);
  });

  it('Tokenを失った未送信の配信の失敗確定は、その予約の未送信の配信数に比例した行数しか読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    await createNotificationDeliveryRepository(
      db
    ).markPendingDeliveriesWithoutTokenFailed(
      targetScheduleId,
      '配信前にTokenが削除されました',
      NOW
    );

    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_FAIL);
  });

  it('未送信の配信の有無と予約の完了判定は、配信数に比例した行数を読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();
    const repository = createNotificationDeliveryRepository(db);

    const hasPending = await repository.hasPendingDeliveries(targetScheduleId);
    const completed = await repository.completeScheduleIfDone(
      targetScheduleId,
      NOW
    );

    expect(hasPending).toBe(true);
    expect(completed).toBe(false);
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_CHECK);
  });

  it('毎分の後片付けは、片付ける配信がなければ未送信の配信を読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const retiredScheduleIds = await createNotificationDeliveryRepository(
      db
    ).retireUnsendableDeliveries(NOW, NOW, 6);

    expect(retiredScheduleIds).toEqual([]);
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_CHECK);
  });

  it('毎分の後片付けは、Tokenを失った未送信の配信だけを読んで失敗にする', async () => {
    await env.DB.prepare(
      `DELETE FROM firebase_tokens WHERE firebase_token_id = (
         SELECT d.firebase_token_id FROM notification_push_deliveries d
         JOIN notification_recipients r USING (notification_recipient_id)
         WHERE r.notification_schedule_id = ? AND d.status = 'pending'
         LIMIT 1
       )`
    )
      .bind(targetScheduleId)
      .run();
    const { db, rowsRead } = createReadCountingDb();

    const retiredScheduleIds = await createNotificationDeliveryRepository(
      db
    ).retireUnsendableDeliveries(NOW, NOW, 6);

    expect(retiredScheduleIds).toEqual([targetScheduleId]);
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_CHECK);
    const retired = await env.DB.prepare(
      `SELECT status FROM notification_push_deliveries
       WHERE firebase_token_id IS NULL`
    ).all<{ status: string }>();
    expect(retired.results).toEqual([{ status: 'failed' }]);
  });

  it('送信対象の予約の検索は、配信数に比例した行数を読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const schedules = await createNotificationDeliveryRepository(
      db
    ).findReadySchedules(NOW, 100);

    expect(schedules).toHaveLength(2);
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_CHECK);
  });
});
