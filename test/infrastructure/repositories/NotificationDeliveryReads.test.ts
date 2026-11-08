import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationDeliveryService } from '../../../src/application/services/NotificationDeliveryService';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';
import { clearNotificationFixtures } from '../../notificationDeliveryFixtures';

const NOW = '2026-11-27T01:00:00.000Z';
const TARGET_RECIPIENTS = 50;
const OTHER_RECIPIENTS = 1000;
const TARGET_SENT_RECIPIENTS = 1000;
const MAX_ROWS_READ_TO_SEND = TARGET_RECIPIENTS * 60;
const MAX_ROWS_READ_TO_FAIL = TARGET_RECIPIENTS * 10;
const MAX_ROWS_READ_TO_CHECK = 60;

function createReadCountingDb() {
  let rowsRead = 0;
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
    ({
      statement,
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      async first<T>(column?: string) {
        const result = await statement.all<Record<string, unknown>>();
        rowsRead += result.meta.rows_read;
        const row = result.results[0];
        if (!row) return null;
        return (column ? row[column] : row) as T;
      },
      async all<T>() {
        const result = await statement.all<T>();
        rowsRead += result.meta.rows_read;
        return result;
      },
      async run<T>() {
        const result = await statement.run<T>();
        rowsRead += result.meta.rows_read;
        return result;
      },
    }) as unknown as D1PreparedStatement;
  const db = {
    prepare: (query: string) => wrap(env.DB.prepare(query)),
    async batch(statements: D1PreparedStatement[]) {
      const results = await env.DB.batch(
        statements.map(
          statement =>
            (statement as unknown as { statement: D1PreparedStatement })
              .statement
        )
      );
      for (const result of results) rowsRead += result.meta.rows_read;
      return results;
    },
  } as unknown as D1Database;
  return { db, rowsRead: () => rowsRead };
}

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

  it('送信対象の予約の検索は、配信数に比例した行数を読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const schedules = await createNotificationDeliveryRepository(
      db
    ).findReadySchedules(NOW, 100);

    expect(schedules).toHaveLength(2);
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_CHECK);
  });
});
