import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createAdminNotificationQueryRepository } from '../../../src/infrastructure/repositories/AdminNotificationQueryRepository';
import { createNotificationResultQueryRepository } from '../../../src/infrastructure/repositories/NotificationResultQueryRepository';
import { createNotificationScheduleQueryRepository } from '../../../src/infrastructure/repositories/NotificationScheduleQueryRepository';
import { buildCommand } from './adminNotificationRepositoryFixtures';

const TARGET_RECIPIENTS = 50;
const OTHER_RECIPIENTS = 1000;
const MAX_ROWS_READ_PER_RECIPIENT = 20;
const MAX_ROWS_READ = TARGET_RECIPIENTS * MAX_ROWS_READ_PER_RECIPIENT;

interface ReadCountingStatement {
  statement: D1PreparedStatement;
  bind(...values: unknown[]): ReadCountingStatement;
  first<T>(column?: string): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run<T>(): Promise<D1Result<T>>;
}

function createReadCountingDb() {
  let rowsRead = 0;
  const wrap = (statement: D1PreparedStatement): ReadCountingStatement => ({
    statement,
    bind: (...values) => wrap(statement.bind(...values)),
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
  });
  const db = {
    prepare: (query: string) => wrap(env.DB.prepare(query)),
    async batch(statements: ReadCountingStatement[]) {
      const results = await env.DB.batch(
        statements.map(({ statement }) => statement)
      );
      for (const result of results) rowsRead += result.meta.rows_read;
      return results;
    },
  } as unknown as D1Database;
  return { db, rowsRead: () => rowsRead };
}

async function insertScheduleWithDeliveries(
  actorUserId: number,
  sendAt: string,
  recipientCount: number
) {
  const created = await createAdminNotificationCommandRepository(env.DB).create(
    {
      ...buildCommand(actorUserId, [{ type: 'user', target_id: actorUserId }]),
      send_at: sendAt,
    }
  );
  const scheduleId = created.notification_schedule_id;
  await env.DB.batch([
    env.DB.prepare(
      `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
       INSERT INTO users (user_name)
       SELECT 'schedule-' || ? || '-recipient-' || n FROM seq`
    ).bind(recipientCount, scheduleId),
    env.DB.prepare(
      `INSERT INTO notification_recipients (notification_schedule_id, user_id)
       SELECT ?, user_id FROM users WHERE user_name LIKE 'schedule-' || ? || '-recipient-%'`
    ).bind(scheduleId, scheduleId),
    env.DB.prepare(
      `INSERT INTO notification_push_deliveries (notification_recipient_id, platform, status)
       SELECT nr.notification_recipient_id, p.platform,
              CASE WHEN nr.notification_recipient_id % 2 = 0 THEN 'sent' ELSE 'failed' END
       FROM notification_recipients nr
       CROSS JOIN (SELECT 1 AS platform UNION ALL SELECT 2) p
       WHERE nr.notification_schedule_id = ?`
    ).bind(scheduleId),
  ]);
  return created;
}

describe('配信状況を返す管理用クエリのD1読み取り行数', () => {
  let target: { notification_id: number; notification_schedule_id: number };

  beforeAll(async () => {
    await env.DB.batch(
      [
        'notification_push_deliveries',
        'notification_recipients',
        'notification_audiences',
        'notification_schedules',
        'notifications',
        'staffs',
        'users',
      ].map(table => env.DB.prepare(`DELETE FROM ${table}`))
    );
    const actor = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('配信状況を見るスタッフ') RETURNING user_id"
    ).first<{ user_id: number }>();
    if (!actor) throw new Error('Userの作成に失敗しました');
    await insertScheduleWithDeliveries(
      actor.user_id,
      '2026-09-01T10:00:00.000Z',
      OTHER_RECIPIENTS
    );
    target = await insertScheduleWithDeliveries(
      actor.user_id,
      '2026-09-24T10:00:00.000Z',
      TARGET_RECIPIENTS
    );
  });

  it('通知一覧は、他の通知の配信が多くても期間内の受信者数に比例した行数しか読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const notifications = await createAdminNotificationQueryRepository(
      db
    ).findAll({
      from: '2026-09-24T00:00:00.000Z',
      to: '2026-09-24T23:59:59.999Z',
    });

    expect(
      notifications[0]?.schedules[0]?.recipient_push_summary
    ).toMatchObject({
      total_count: TARGET_RECIPIENTS,
      success_count: TARGET_RECIPIENTS / 2,
      failed_count: TARGET_RECIPIENTS / 2,
    });
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ);
  });

  it('通知の詳細は、他の通知の配信が多くてもその通知の受信者数に比例した行数しか読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const notification = await createAdminNotificationQueryRepository(
      db
    ).findById(target.notification_id);

    expect(notification?.schedules[0]?.recipient_push_summary).toMatchObject({
      total_count: TARGET_RECIPIENTS,
      success_count: TARGET_RECIPIENTS / 2,
      failed_count: TARGET_RECIPIENTS / 2,
    });
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ);
  });

  it('予約の詳細は、他の通知の配信が多くてもその予約の受信者数に比例した行数しか読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const schedule = await createNotificationScheduleQueryRepository(
      db
    ).findById(target.notification_schedule_id);

    expect(schedule?.delivery_progress).toMatchObject({
      total_count: TARGET_RECIPIENTS * 2,
      sent_count: TARGET_RECIPIENTS,
      failed_count: TARGET_RECIPIENTS,
    });
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ);
  });

  it('予約の受信者ごとの結果は、他の通知の配信が多くてもその予約の受信者数に比例した行数しか読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const results = await createNotificationResultQueryRepository(
      db
    ).findScheduleResults(target.notification_schedule_id, {
      page: 1,
      limit: TARGET_RECIPIENTS,
    });

    expect(results?.recipients).toHaveLength(TARGET_RECIPIENTS);
    expect(results?.recipients[0]?.deliveries).toHaveLength(2);
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ);
  });
});
