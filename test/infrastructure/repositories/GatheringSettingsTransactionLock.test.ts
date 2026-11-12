import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTOMATIC_SYNC_PENDING_REASON } from '../../../src/domain/entities/NotificationCreation';
import { GATHERING_NOTIFICATION_CLEANUP_POLICY } from '../../../src/domain/entities/GatheringNotificationCleanup';
import type { EventGatheringChangeSet } from '../../../src/domain/entities/EventGathering';
import { createGatheringSettingsTransaction } from '../../../src/infrastructure/transactions/GatheringSettingsTransaction';
import { clearNotificationFixtures } from '../../notificationDeliveryFixtures';

const NOW = '2026-10-22T09:00:00.000Z';

// 集合設定の保存の楽観ロック。版が一致しないときは、集合予定の作成・更新・削除だけでなく、
// 通知の保留・停止・削除も含めて、何も書かれないことを確認する。
describe('GatheringSettingsTransaction の楽観ロック', () => {
  const transaction = createGatheringSettingsTransaction(env.DB);
  let eventIds: number[] = [];
  let spotIds: number[] = [];
  let userIds: number[] = [];

  beforeEach(clearNotificationFixtures);

  afterEach(async () => {
    await clearNotificationFixtures();
    for (const userId of userIds) {
      await env.DB.prepare(
        'DELETE FROM gathering_group_members WHERE user_id = ?'
      )
        .bind(userId)
        .run();
      await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
        .bind(userId)
        .run();
    }
    for (const eventId of eventIds) {
      await env.DB.prepare('DELETE FROM gatherings WHERE event_id = ?')
        .bind(eventId)
        .run();
      await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
        .bind(eventId)
        .run();
    }
    for (const spotId of spotIds) {
      await env.DB.prepare(
        'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
      )
        .bind(spotId)
        .run();
    }
    eventIds = [];
    spotIds = [];
    userIds = [];
  });

  async function insertEvent(name: string): Promise<number> {
    const row = await env.DB.prepare(
      "INSERT INTO events (event_name, start_time, end_time) VALUES (?, '0900', '1000') RETURNING event_id"
    )
      .bind(name)
      .first<{ event_id: number }>();
    eventIds.push(row!.event_id);
    return row!.event_id;
  }

  async function insertSpot(name: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
      .bind(name)
      .first<{ gathering_spot_id: number }>();
    spotIds.push(row!.gathering_spot_id);
    return row!.gathering_spot_id;
  }

  async function insertGathering(
    eventId: number,
    spotId: number,
    time: string
  ): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id, gathering_time, round) VALUES (?, ?, ?, 1) RETURNING gathering_id'
    )
      .bind(eventId, spotId, time)
      .first<{ gathering_id: number }>();
    return row!.gathering_id;
  }

  // 集合に紐づく自動通知とSchedule。createdAtは同じ値にする（保留の対象条件）。
  async function insertNotification(gatheringId: number, title: string) {
    const createdAt = '2026-10-22T01:00:00.000Z';
    const notification = await env.DB.prepare(
      `INSERT INTO notifications (
         push_title, push_body, notification_type, title, body,
         source_type, source_id, source_hash, created_at
       ) VALUES (?, ?, 'notification_general', ?, ?, 'gathering', ?, ?, ?)
       RETURNING notification_id`
    )
      .bind(
        title,
        `${title}の本文`,
        title,
        `${title}の詳細`,
        gatheringId,
        `hash-${title}`,
        createdAt
      )
      .first<{ notification_id: number }>();
    const schedule = await env.DB.prepare(
      `INSERT INTO notification_schedules (
         notification_id, send_status, send_at, created_at
       ) VALUES (?, 'scheduled', ?, ?)
       RETURNING notification_schedule_id`
    )
      .bind(notification!.notification_id, NOW, createdAt)
      .first<{ notification_schedule_id: number }>();
    return {
      notificationId: notification!.notification_id,
      scheduleId: schedule!.notification_schedule_id,
    };
  }

  async function lockVersionOf(eventId: number): Promise<number> {
    const row = await env.DB.prepare(
      'SELECT lock_version FROM events WHERE event_id = ?'
    )
      .bind(eventId)
      .first<{ lock_version: number }>();
    return row!.lock_version;
  }

  async function setLockVersion(eventId: number, version: number) {
    await env.DB.prepare(
      'UPDATE events SET lock_version = ? WHERE event_id = ?'
    )
      .bind(version, eventId)
      .run();
  }

  async function gatheringsOf(eventId: number) {
    const { results } = await env.DB.prepare(
      'SELECT gathering_id, gathering_time FROM gatherings WHERE event_id = ? ORDER BY gathering_id'
    )
      .bind(eventId)
      .all<{ gathering_id: number; gathering_time: string }>();
    return results;
  }

  async function exists(sql: string, id: number): Promise<boolean> {
    return (await env.DB.prepare(sql).bind(id).first()) !== null;
  }

  const cleanupOf = (gatheringId: number) => ({
    notificationCleanup: {
      gathering_ids: [gatheringId],
      stop_policy: {
        stopped_by_user_id: null,
        reason: 'source_deleted' as const,
        allowed_statuses: ['resolving', 'sending'] as (
          'resolving' | 'sending'
        )[],
        now: NOW,
      },
      cleanup_policy: GATHERING_NOTIFICATION_CLEANUP_POLICY,
    },
  });

  const createOnly = (
    eventId: number,
    spotId: number
  ): EventGatheringChangeSet => ({
    event_id: eventId,
    creates: [
      {
        round: 1,
        round_start_time: null,
        gathering_time: '10:00',
        gathering_spot_id: spotId,
      },
    ],
    updates: [],
    delete_ids: [],
  });

  it('変更があればeventsの lock_version を1進め、true を返す', async () => {
    const eventId = await insertEvent('取引ロック進行');
    const spotId = await insertSpot('取引ロック進行場所');

    const applied = await transaction.apply(createOnly(eventId, spotId));

    expect(applied).toBe(true);
    expect(await lockVersionOf(eventId)).toBe(1);
  });

  it('変更が無い保存は何も書かず、版も進めない', async () => {
    const eventId = await insertEvent('取引ロック無変更');

    const applied = await transaction.apply(
      { event_id: eventId, creates: [], updates: [], delete_ids: [] },
      {},
      { expectedLockVersion: 0 }
    );

    expect(applied).toBe(true);
    expect(await lockVersionOf(eventId)).toBe(0);
  });

  it('取得時点の版を指定して一致すれば、適用して版を進める', async () => {
    const eventId = await insertEvent('取引ロック一致');
    const spotId = await insertSpot('取引ロック一致場所');
    const target = await insertGathering(eventId, spotId, '10:00');

    const applied = await transaction.apply(
      {
        event_id: eventId,
        creates: [],
        updates: [
          {
            gathering_id: target,
            round: 1,
            round_start_time: null,
            gathering_time: '10:30',
            gathering_spot_id: spotId,
          },
        ],
        delete_ids: [],
      },
      {},
      { expectedLockVersion: 0 }
    );

    expect(applied).toBe(true);
    expect(await gatheringsOf(eventId)).toEqual([
      { gathering_id: target, gathering_time: '10:30' },
    ]);
    expect(await lockVersionOf(eventId)).toBe(1);
  });

  it('版が違えば false を返し、作成・更新・削除のどれも行わず、版も進めない', async () => {
    const eventId = await insertEvent('取引ロック不一致');
    const spotId = await insertSpot('取引ロック不一致場所');
    const toUpdate = await insertGathering(eventId, spotId, '10:00');
    const toDelete = await insertGathering(eventId, spotId, '10:30');
    // 別の操作が先に保存した状態にする（版が 0 → 1）
    await setLockVersion(eventId, 1);

    const applied = await transaction.apply(
      {
        event_id: eventId,
        creates: [
          {
            round: 2,
            round_start_time: null,
            gathering_time: '11:00',
            gathering_spot_id: spotId,
          },
        ],
        updates: [
          {
            gathering_id: toUpdate,
            round: 1,
            round_start_time: null,
            gathering_time: '10:15',
            gathering_spot_id: spotId,
          },
        ],
        delete_ids: [toDelete],
      },
      {},
      { expectedLockVersion: 0 }
    );

    expect(applied).toBe(false);
    // 更新されておらず、削除もされておらず、作成もされていない
    expect(await gatheringsOf(eventId)).toEqual([
      { gathering_id: toUpdate, gathering_time: '10:00' },
      { gathering_id: toDelete, gathering_time: '10:30' },
    ]);
    expect(await lockVersionOf(eventId)).toBe(1);
  });

  it('版が違えば、削除する集合の通知・Scheduleも削除・停止しない', async () => {
    const eventId = await insertEvent('取引ロック通知cleanup');
    const spotId = await insertSpot('取引ロック通知cleanup場所');
    const gatheringId = await insertGathering(eventId, spotId, '10:00');
    const { notificationId, scheduleId } = await insertNotification(
      gatheringId,
      '版不一致の通知'
    );
    await setLockVersion(eventId, 1);

    const applied = await transaction.apply(
      {
        event_id: eventId,
        creates: [],
        updates: [],
        delete_ids: [gatheringId],
      },
      cleanupOf(gatheringId),
      { expectedLockVersion: 0 }
    );

    expect(applied).toBe(false);
    // 集合も、その通知とScheduleも、そのまま残る
    expect(await gatheringsOf(eventId)).toHaveLength(1);
    expect(
      await exists(
        'SELECT 1 FROM notifications WHERE notification_id = ?',
        notificationId
      )
    ).toBe(true);
    expect(
      await exists(
        'SELECT 1 FROM notification_schedules WHERE notification_schedule_id = ?',
        scheduleId
      )
    ).toBe(true);
  });

  it('版が一致すれば、削除する集合の通知・Scheduleも削除する', async () => {
    const eventId = await insertEvent('取引ロック通知cleanup一致');
    const spotId = await insertSpot('取引ロック通知cleanup一致場所');
    const gatheringId = await insertGathering(eventId, spotId, '10:00');
    const { notificationId, scheduleId } = await insertNotification(
      gatheringId,
      '版一致の通知'
    );

    const applied = await transaction.apply(
      {
        event_id: eventId,
        creates: [],
        updates: [],
        delete_ids: [gatheringId],
      },
      cleanupOf(gatheringId),
      { expectedLockVersion: 0 }
    );

    expect(applied).toBe(true);
    expect(await gatheringsOf(eventId)).toHaveLength(0);
    expect(
      await exists(
        'SELECT 1 FROM notifications WHERE notification_id = ?',
        notificationId
      )
    ).toBe(false);
    expect(
      await exists(
        'SELECT 1 FROM notification_schedules WHERE notification_schedule_id = ?',
        scheduleId
      )
    ).toBe(false);
    expect(await lockVersionOf(eventId)).toBe(1);
  });

  it('版が違えば、旧Scheduleの保留もしない', async () => {
    const eventId = await insertEvent('取引ロック保留');
    const spotId = await insertSpot('取引ロック保留場所');
    const gatheringId = await insertGathering(eventId, spotId, '10:45');
    const { scheduleId } = await insertNotification(gatheringId, '保留対象');
    await setLockVersion(eventId, 1);

    const applied = await transaction.apply(
      {
        event_id: eventId,
        creates: [],
        updates: [
          {
            gathering_id: gatheringId,
            round: 1,
            round_start_time: null,
            gathering_time: '11:00',
            gathering_spot_id: spotId,
          },
        ],
        delete_ids: [],
      },
      { holdNotificationSyncGatheringIds: [gatheringId] },
      { expectedLockVersion: 0 }
    );

    expect(applied).toBe(false);
    const schedule = await env.DB.prepare(
      'SELECT failed_reason FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(scheduleId)
      .first<{ failed_reason: string | null }>();
    expect(schedule?.failed_reason).toBeNull();
    expect(schedule?.failed_reason).not.toBe(AUTOMATIC_SYNC_PENDING_REASON);
    expect(await gatheringsOf(eventId)).toEqual([
      { gathering_id: gatheringId, gathering_time: '10:45' },
    ]);
  });

  it('同じ版から続けて保存しても、2回目は false になる', async () => {
    const eventId = await insertEvent('取引ロック連続');
    const spotId = await insertSpot('取引ロック連続場所');
    const changeSet = createOnly(eventId, spotId);

    const first = await transaction.apply(
      changeSet,
      {},
      { expectedLockVersion: 0 }
    );
    const second = await transaction.apply(
      changeSet,
      {},
      { expectedLockVersion: 0 }
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    // 1回目の作成だけが残る
    expect(await gatheringsOf(eventId)).toHaveLength(1);
  });

  it('版を指定しない従来の保存も、eventsの版を進める', async () => {
    const eventId = await insertEvent('取引ロック未指定');
    const spotId = await insertSpot('取引ロック未指定場所');
    const changeSet = createOnly(eventId, spotId);

    await transaction.apply(changeSet);
    await transaction.apply(changeSet);

    expect(await lockVersionOf(eventId)).toBe(2);
  });

  it('Eventが存在しないとき、版を指定した保存は何も書かず false を返す', async () => {
    const spotId = await insertSpot('取引ロックEvent無し場所');

    const applied = await transaction.apply(
      createOnly(999999, spotId),
      {},
      { expectedLockVersion: 0 }
    );

    expect(applied).toBe(false);
  });

  it('版の不一致以外の失敗（参加者がいる集合の削除）は、false にせず投げる', async () => {
    const eventId = await insertEvent('取引ロックFK');
    const spotId = await insertSpot('取引ロックFK場所');
    const gatheringId = await insertGathering(eventId, spotId, '10:00');
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('取引ロック利用者') RETURNING user_id"
    ).first<{ user_id: number }>();
    userIds.push(user!.user_id);
    await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    )
      .bind(gatheringId, user!.user_id)
      .run();

    await expect(
      transaction.apply(
        {
          event_id: eventId,
          creates: [],
          updates: [],
          delete_ids: [gatheringId],
        },
        {},
        { expectedLockVersion: 0 }
      )
    ).rejects.toThrow('FOREIGN KEY constraint failed');

    // 全体が取り消され、集合も版もそのまま
    expect(await gatheringsOf(eventId)).toHaveLength(1);
    expect(await lockVersionOf(eventId)).toBe(0);
  });

  it('退会中の参加者しかいない集合は、版を指定した保存でもその所属と一緒に削除する', async () => {
    const eventId = await insertEvent('取引ロック退会者');
    const spotId = await insertSpot('取引ロック退会者場所');
    const gatheringId = await insertGathering(eventId, spotId, '10:00');
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('削除済みユーザー', 'deleted') RETURNING user_id"
    ).first<{ user_id: number }>();
    userIds.push(user!.user_id);
    await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    )
      .bind(gatheringId, user!.user_id)
      .run();

    const applied = await transaction.apply(
      {
        event_id: eventId,
        creates: [],
        updates: [],
        delete_ids: [gatheringId],
      },
      {},
      { expectedLockVersion: 0 }
    );

    expect(applied).toBe(true);
    expect(await gatheringsOf(eventId)).toEqual([]);
    const member = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM gathering_group_members WHERE gathering_id = ?'
    )
      .bind(gatheringId)
      .first<{ n: number }>();
    expect(member?.n).toBe(0);
    expect(await lockVersionOf(eventId)).toBe(1);
  });
});
