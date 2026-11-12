import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';
import { clearNotificationFixtures } from '../../notificationDeliveryFixtures';
import { createReadCountingDb } from '../../readCountingDb';

const NOW = '2026-11-27T01:00:00.000Z';
const FUTURE_SCHEDULES = 500;
const FINISHED_SCHEDULES = 300;
const MAX_ROWS_READ_TO_CHECK =
  Math.min(FUTURE_SCHEDULES, FINISHED_SCHEDULES) / 10;

async function insertSchedules(
  count: number,
  sendStatus: string,
  sendAt: string,
  recipientsResolvedAt: string | null = null
) {
  await env.DB.batch([
    env.DB.prepare(
      `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
       INSERT INTO notifications (push_title, push_body, notification_type, title, body)
       SELECT ? || n, '本文', 'notification_general', '詳細', '詳細本文' FROM seq`
    ).bind(count, `${sendStatus}-${sendAt}-`),
    env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_id, send_status, send_at, recipients_resolved_at
       )
       SELECT notification_id, ?, ?, ? FROM notifications
       WHERE push_title LIKE ? || '%'`
    ).bind(
      sendStatus,
      sendAt,
      recipientsResolvedAt,
      `${sendStatus}-${sendAt}-`
    ),
  ]);
}

describe('送る前の予約が溜まっているときの、毎分の送信対象の確認のD1読み取り行数', () => {
  beforeEach(async () => {
    await clearNotificationFixtures();
    await insertSchedules(
      FUTURE_SCHEDULES,
      'scheduled',
      '2026-11-28T00:45:00.000Z'
    );
    await insertSchedules(
      FINISHED_SCHEDULES,
      'completed',
      '2026-11-20T00:45:00.000Z',
      '2026-11-20T00:45:00.000Z'
    );
    await insertSchedules(1, 'scheduled', '2026-11-27T00:59:00.000Z');
    await insertSchedules(
      1,
      'resolving',
      '2026-11-27T00:59:00.000Z',
      '2026-11-27T00:59:30.000Z'
    );
  });

  it('受信者を決める予約の検索は、時刻が来ていない予約を読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const candidates = await createNotificationAudienceResolverRepository(
      db
    ).findDueCandidates(NOW, 100);

    expect(candidates).toHaveLength(1);
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_CHECK);
  });

  it('配信を準備する予約の検索は、時刻が来ていない予約と送り終えた予約を読まない', async () => {
    const { db, rowsRead } = createReadCountingDb();

    const schedules = await createNotificationDeliveryRepository(
      db
    ).findReadySchedules(NOW, 100);

    expect(schedules).toHaveLength(1);
    expect(rowsRead()).toBeLessThan(MAX_ROWS_READ_TO_CHECK);
  });
});

async function scheduleIdAt(sendAt: string) {
  return env.DB.prepare(
    'SELECT notification_schedule_id FROM notification_schedules WHERE send_at = ?'
  )
    .bind(sendAt)
    .first<number>('notification_schedule_id');
}

describe.each(['2026-11-27T01:00:00.000Z', '2026-11-27T01:00:00.500Z'])(
  '毎分の送信対象の確認で、確認した時刻が%sのとき送る時刻を秒単位で比べる',
  now => {
    beforeEach(async () => {
      await clearNotificationFixtures();
    });

    it('受信者を決める予約は、同じ秒のうちの予約まで対象にし、次の秒の予約は対象にしない', async () => {
      await insertSchedules(1, 'scheduled', '2026-11-27T01:00:00.999Z');
      await insertSchedules(1, 'scheduled', '2026-11-27T01:00:01.000Z');

      const candidates = await createNotificationAudienceResolverRepository(
        env.DB
      ).findDueCandidates(now, 100);

      expect(candidates.map(c => c.notification_schedule_id)).toEqual([
        await scheduleIdAt('2026-11-27T01:00:00.999Z'),
      ]);
    });

    it('配信を準備する予約は、同じ秒のうちの予約まで対象にし、次の秒の予約は対象にしない', async () => {
      await insertSchedules(
        1,
        'resolving',
        '2026-11-27T01:00:00.999Z',
        '2026-11-27T00:59:30.000Z'
      );
      await insertSchedules(
        1,
        'resolving',
        '2026-11-27T01:00:01.000Z',
        '2026-11-27T00:59:30.000Z'
      );

      const schedules = await createNotificationDeliveryRepository(
        env.DB
      ).findReadySchedules(now, 100);

      expect(schedules.map(s => s.notification_schedule_id)).toEqual([
        await scheduleIdAt('2026-11-27T01:00:00.999Z'),
      ]);
    });
  }
);
