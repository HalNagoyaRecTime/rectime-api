import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import registrationSql from '../../operations/official-schedule-2026.sql?raw';
import verificationSql from '../../operations/verify-official-schedule-2026.sql?raw';

const cleanupMigration = '0047_remove_initial_dummy_data.sql';
const names = [
  '出席確認①',
  '開会式',
  '第一競技「走れ！○人○脚！」',
  '第二競技「ドッジボール」',
  '昼休憩＋コスプレ大会',
  '出席確認②',
  '第三競技「紙飛行機飛ばし」',
  '第四競技「学科別対抗リレー」',
  '出席確認③',
  '表彰式・閉会式',
];
const allTestNames = [...names, '552対象外イベント'];
const placeholders = allTestNames.map(() => '?').join(', ');
const queries = registrationSql
  .split(';')
  .map(query => query.trim())
  .filter(Boolean);

type Row = Record<string, unknown>;
type Value = string | number | null;
let previousHistory: Row | null;

async function execute(sql: string, ...values: Value[]) {
  return env.DB.prepare(sql)
    .bind(...values)
    .run();
}

async function rows(sql: string, ...values: Value[]): Promise<Row[]> {
  return (
    await env.DB.prepare(sql)
      .bind(...values)
      .all<Row>()
  ).results;
}

async function insertEvent(
  name = names[2],
  start = '1030',
  end = '1130',
  rule: string | null = null
): Promise<number> {
  const event = await env.DB.prepare(
    `INSERT INTO events (event_name, start_time, end_time, rule_text)
     VALUES (?, ?, ?, ?) RETURNING event_id`
  )
    .bind(name, start, end, rule)
    .first<{ event_id: number }>();
  return event!.event_id;
}

async function insertSpot(name = '未定（仮）'): Promise<number> {
  const spot = await env.DB.prepare(
    'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
  )
    .bind(name)
    .first<{ gathering_spot_id: number }>();
  return spot!.gathering_spot_id;
}

async function insertGathering(
  eventId: number,
  spotId: number,
  round = 1,
  time = '10:20',
  start: string | null = '1030'
): Promise<number> {
  const gathering = await env.DB.prepare(
    `INSERT INTO gatherings
       (event_id, gathering_spot_id, round, gathering_time, round_start_time)
     VALUES (?, ?, ?, ?, ?) RETURNING gathering_id`
  )
    .bind(eventId, spotId, round, time, start)
    .first<{ gathering_id: number }>();
  return gathering!.gathering_id;
}

async function runRegistration() {
  await env.DB.batch(queries.map(query => env.DB.prepare(query)));
}

async function snapshot(): Promise<Record<string, Row[]>> {
  const result: Record<string, Row[]> = {};
  for (const [table, key] of [
    ['events', 'event_id'],
    ['event_venues', 'event_venue_id'],
    ['venues', 'venue_id'],
    ['gatherings', 'gathering_id'],
    ['gathering_spots', 'gathering_spot_id'],
    ['gathering_group_members', 'gathering_group_member_id'],
    ['users', 'user_id'],
  ]) {
    result[table] = await rows(`SELECT * FROM ${table} ORDER BY ${key}`);
  }
  result.sequences = await rows(
    'SELECT name, seq FROM sqlite_sequence ORDER BY name'
  );
  result.workTables = await rows(
    "SELECT name FROM sqlite_master WHERE name GLOB '__official_schedule_2026_*' ORDER BY name"
  );
  return result;
}

async function expectRejectedWithoutChanges() {
  const before = await snapshot();
  await expect(runRegistration()).rejects.toThrow(
    'official_schedule_2026_preconditions'
  );
  expect(await snapshot()).toEqual(before);
}

beforeEach(async () => {
  previousHistory = await env.DB.prepare(
    'SELECT * FROM d1_migrations WHERE name = ?'
  )
    .bind(cleanupMigration)
    .first<Row>();
  if (!previousHistory) {
    await execute(
      'INSERT INTO d1_migrations (name) VALUES (?)',
      cleanupMigration
    );
  }
});

afterEach(async () => {
  const eventIds = `SELECT event_id FROM events WHERE event_name IN (${placeholders})`;
  const gatheringIds = `SELECT gathering_id FROM gatherings WHERE event_id IN (${eventIds})`;
  await execute(
    `DELETE FROM gathering_group_members WHERE gathering_id IN (${gatheringIds})`,
    ...allTestNames
  );
  await execute(
    `DELETE FROM gatherings WHERE event_id IN (${eventIds})`,
    ...allTestNames
  );
  await execute(
    `DELETE FROM event_venues WHERE event_id IN (${eventIds})`,
    ...allTestNames
  );
  await execute(
    `DELETE FROM events WHERE event_name IN (${placeholders})`,
    ...allTestNames
  );
  await execute(
    "DELETE FROM gathering_spots WHERE gathering_spot_name IN ('未定（仮）', '552対象外集合場所')"
  );
  await execute("DELETE FROM venues WHERE venue_name = '552確定済会場'");
  await execute("DELETE FROM users WHERE user_name = '552対象外ユーザー'");
  await execute('DELETE FROM d1_migrations WHERE name = ?', cleanupMigration);
  if (previousHistory) {
    await execute(
      'INSERT INTO d1_migrations (id, name, applied_at) VALUES (?, ?, ?)',
      previousHistory.id as number,
      previousHistory.name as string,
      previousHistory.applied_at as string
    );
  }
});

describe('正式スケジュールと仮Roundの登録SQL', () => {
  it('10件の名称・時刻・備考と、競技だけに参加者なしの仮Roundを登録する', async () => {
    await runRegistration();

    expect(
      await rows(
        `SELECT event_name, start_time, end_time, rule_text FROM events
         WHERE event_name IN (${names.map(() => '?').join(', ')})
         ORDER BY start_time, event_name`,
        ...names
      )
    ).toEqual(
      [
        ['出席確認①', '1000', '1000', '10:00締切'],
        ['開会式', '1000', '1020', '諸注意説明、競技誘導'],
        ['第一競技「走れ！○人○脚！」', '1030', '1130', null],
        ['第二競技「ドッジボール」', '1130', '1300', null],
        ['昼休憩＋コスプレ大会', '1300', '1400', '当日の審査は8チームで実施'],
        ['出席確認②', '1330', '1330', '13:30締切'],
        ['第三競技「紙飛行機飛ばし」', '1400', '1500', null],
        ['第四競技「学科別対抗リレー」', '1500', '1530', null],
        ['出席確認③', '1540', '1540', '15:40締切'],
        ['表彰式・閉会式', '1540', '1600', null],
      ].map(([event_name, start_time, end_time, rule_text]) => ({
        event_name,
        start_time,
        end_time,
        rule_text,
      }))
    );
    expect(
      await rows(
        `SELECT event.event_name, gathering.round, gathering.gathering_time,
                gathering.round_start_time, spot.gathering_spot_name,
                (SELECT COUNT(*) FROM gathering_group_members AS member
                 WHERE member.gathering_id = gathering.gathering_id) AS members
         FROM gatherings AS gathering
         JOIN events AS event ON event.event_id = gathering.event_id
         JOIN gathering_spots AS spot
           ON spot.gathering_spot_id = gathering.gathering_spot_id
         WHERE event.event_name IN (${names.map(() => '?').join(', ')})
         ORDER BY event.start_time`,
        ...names
      )
    ).toEqual(
      [
        [names[2], '10:20', '1030'],
        [names[3], '11:20', '1130'],
        [names[6], '13:50', '1400'],
        [names[7], '14:50', '1500'],
      ].map(([event_name, gathering_time, round_start_time]) => ({
        event_name,
        round: 1,
        gathering_time,
        round_start_time,
        gathering_spot_name: '未定（仮）',
        members: 0,
      }))
    );
    expect(
      await rows(
        `SELECT * FROM event_venues WHERE event_id IN (
           SELECT event_id FROM events WHERE event_name IN (${names.map(() => '?').join(', ')})
         )`,
        ...names
      )
    ).toEqual([]);
    expect(
      await rows(
        "SELECT name FROM sqlite_master WHERE name GLOB '__official_schedule_2026_*'"
      )
    ).toEqual([]);
    const registered = await snapshot();
    const verification = await env.DB.batch<Row>(
      verificationSql
        .split(';')
        .map(query => query.trim())
        .filter(Boolean)
        .map(query => env.DB.prepare(query))
    );
    expect(verification[0].results).toHaveLength(10);
    expect(
      verification[0].results.every(row => row.registration_status === '正常')
    ).toBe(true);
    expect(verification[1].results).toHaveLength(4);
    expect(verification[2].results).toEqual([]);
    await runRegistration();
    expect(await snapshot()).toEqual(registered);
  });

  it('同名・同時刻の既存イベントと仮Round、対象外データを保持し、不足だけ補う', async () => {
    const eventId = await insertEvent(
      undefined,
      undefined,
      undefined,
      '確定済ルール'
    );
    const spotId = await insertSpot();
    await insertGathering(eventId, spotId);
    const venue = await env.DB.prepare(
      "INSERT INTO venues (venue_name) VALUES ('552確定済会場') RETURNING venue_id"
    ).first<{ venue_id: number }>();
    await execute(
      'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)',
      eventId,
      venue!.venue_id
    );
    const otherId = await insertEvent(
      '552対象外イベント',
      '0800',
      '0900',
      '対象外'
    );
    const otherSpot = await insertSpot('552対象外集合場所');
    const otherGathering = await insertGathering(
      otherId,
      otherSpot,
      3,
      '07:50',
      '0800'
    );
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('552対象外ユーザー') RETURNING user_id"
    ).first<{ user_id: number }>();
    await execute(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)',
      otherGathering,
      user!.user_id
    );
    const before = await snapshot();

    await runRegistration();

    const after = await snapshot();
    for (const table of [
      'events',
      'gatherings',
      'gathering_spots',
      'event_venues',
      'venues',
      'gathering_group_members',
      'users',
    ]) {
      expect(after[table]).toEqual(expect.arrayContaining(before[table]));
    }
    expect(
      await rows('SELECT * FROM events WHERE event_id = ?', eventId)
    ).toEqual(before.events.filter(event => event.event_id === eventId));
    expect(after.events.length - before.events.length).toBe(9);
    expect(after.gatherings.length - before.gatherings.length).toBe(3);
    expect(after.gathering_spots).toEqual(before.gathering_spots);
    expect(after.event_venues).toEqual(before.event_venues);
    expect(after.gathering_group_members).toEqual(
      before.gathering_group_members
    );
  });

  it('削除migrationの履歴がなければ、作業テーブルも残さず停止する', async () => {
    await execute('DELETE FROM d1_migrations WHERE name = ?', cleanupMigration);
    await expectRejectedWithoutChanges();
  });

  it('同名イベントが複数ある場合は停止する', async () => {
    await insertEvent();
    await insertEvent();
    await expectRejectedWithoutChanges();
  });

  it.each([
    ['開始時刻', '1000', '1130'],
    ['終了時刻', '1030', '1200'],
  ])('同名イベントの%sが異なる場合は停止する', async (_, start, end) => {
    await insertEvent(names[2], start, end);
    await expectRejectedWithoutChanges();
  });

  it('未定（仮）の集合場所が複数あれば停止する', async () => {
    await insertSpot();
    await insertSpot();
    await expectRejectedWithoutChanges();
  });

  it('競技以外に集合予定がある場合は停止する', async () => {
    const eventId = await insertEvent(names[1], '1000', '1020');
    await insertGathering(eventId, await insertSpot());
    await expectRejectedWithoutChanges();
  });

  it.each([
    ['Round番号', 2, '10:20', '1030'],
    ['集合時刻', 1, '10:10', '1030'],
    ['開始時刻', 1, '10:20', '1040'],
    ['未設定の開始時刻', 1, '10:20', null],
  ])('既存の競技の%sが異なる場合は停止する', async (_, round, time, start) => {
    const eventId = await insertEvent();
    await insertGathering(
      eventId,
      await insertSpot(),
      round as number,
      time as string,
      start as string | null
    );
    await expectRejectedWithoutChanges();
  });

  it('競技に集合予定が複数ある場合は停止する', async () => {
    const eventId = await insertEvent();
    const spotId = await insertSpot();
    await insertGathering(eventId, spotId);
    await insertGathering(eventId, spotId);
    await expectRejectedWithoutChanges();
  });

  it('競技の集合場所が異なる場合は停止する', async () => {
    const eventId = await insertEvent();
    await insertGathering(eventId, await insertSpot('552対象外集合場所'));
    await expectRejectedWithoutChanges();
  });

  it('既存の仮Roundに参加者がいる場合は停止する', async () => {
    const eventId = await insertEvent();
    const gatheringId = await insertGathering(eventId, await insertSpot());
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('552対象外ユーザー') RETURNING user_id"
    ).first<{ user_id: number }>();
    await execute(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)',
      gatheringId,
      user!.user_id
    );
    await expectRejectedWithoutChanges();
  });
});
