import { env } from 'cloudflare:workers';
import { beforeEach, expect, it } from 'vitest';
import { AUTOMATIC_SYNC_PENDING_REASON } from '../../../src/domain/entities/NotificationCreation';
import { createGatheringNotificationGeneratorRepository } from '../../../src/infrastructure/repositories/GatheringNotificationGeneratorRepository';
import { clearNotificationFixtures } from '../../notificationDeliveryFixtures';
import { createReadCountingDb } from '../../readCountingDb';

const CREATED_AT = '2026-11-26T00:00:00.000Z';
const HELD_GATHERINGS = 200;
const MAX_ROWS_READ = 20;

beforeEach(async () => {
  await clearNotificationFixtures();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO events (event_name, start_time, end_time) VALUES ('保留解除', '0900', '1000')"
    ),
    env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('保留解除の場所')"
    ),
    env.DB.prepare(
      `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
       INSERT INTO gatherings (event_id, gathering_spot_id, gathering_time, round)
       SELECT (SELECT max(event_id) FROM events),
              (SELECT max(gathering_spot_id) FROM gathering_spots), '10:00', n
       FROM seq`
    ).bind(HELD_GATHERINGS),
    env.DB.prepare(
      `INSERT INTO notifications (
         push_title, push_body, notification_type, title, body,
         source_type, source_id, source_hash, created_at
       )
       SELECT '集合', '本文', 'notification_general', '集合', '詳細',
              'gathering', gathering_id, 'hash-' || gathering_id, ?
       FROM gatherings`
    ).bind(CREATED_AT),
    env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_id, send_status, send_at, failed_reason, created_at
       )
       SELECT notification_id, 'scheduled', '2026-11-27T01:00:00.000Z', ?, ?
       FROM notifications`
    ).bind(AUTOMATIC_SYNC_PENDING_REASON, CREATED_AT),
  ]);
});

it('集合の自動通知の保留解除は、ほかの集合の予定中の予約を読まない', async () => {
  const target = await env.DB.prepare(
    'SELECT min(gathering_id) AS gathering_id FROM gatherings'
  ).first<{ gathering_id: number }>();
  const { db, rowsRead } = createReadCountingDb();

  await createGatheringNotificationGeneratorRepository(
    db
  ).clearAutomaticScheduleHold(target!.gathering_id, '10:00');

  const held = await env.DB.prepare(
    `SELECT n.source_id FROM notification_schedules s
     JOIN notifications n USING (notification_id)
     WHERE s.failed_reason IS NULL`
  ).all<{ source_id: number }>();
  expect(held.results).toEqual([{ source_id: target!.gathering_id }]);
  expect(rowsRead()).toBeLessThan(MAX_ROWS_READ);
});

it('集合の自動通知の保留は、ほかの集合の予定中の予約を読まない', async () => {
  await env.DB.prepare(
    'UPDATE notification_schedules SET failed_reason = NULL'
  ).run();
  const target = await env.DB.prepare(
    'SELECT min(gathering_id) AS gathering_id FROM gatherings'
  ).first<{ gathering_id: number }>();
  const { db, rowsRead } = createReadCountingDb();

  await createGatheringNotificationGeneratorRepository(
    db
  ).holdAutomaticSchedules(target!.gathering_id);

  const held = await env.DB.prepare(
    `SELECT n.source_id FROM notification_schedules s
     JOIN notifications n USING (notification_id)
     WHERE s.failed_reason = ?`
  )
    .bind(AUTOMATIC_SYNC_PENDING_REASON)
    .all<{ source_id: number }>();
  expect(held.results).toEqual([{ source_id: target!.gathering_id }]);
  expect(rowsRead()).toBeLessThan(MAX_ROWS_READ);
});
