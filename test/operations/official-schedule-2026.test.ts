import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import registrationSql from '../../operations/official-schedule-2026.sql?raw';
import verificationSql from '../../operations/verify-official-schedule-2026.sql?raw';

const cleanupMigration = '0047_remove_initial_dummy_data.sql';
const expectedEvents = [
  ['出席確認①', '0930', '1000', 7, 53474, 341088, '10:00締切', '10:00締切'],
  [
    '開会式',
    '1000',
    '1020',
    10,
    277958,
    1489295,
    '諸注意説明、競技誘導',
    '諸注意説明、競技誘導',
  ],
  [
    '走れ！○人○脚！',
    '1030',
    '1130',
    376,
    5091741,
    840864922,
    '## 競技詳細\n\n〜ルール〜',
    '10位:10 失格:0',
  ],
  [
    'ロイヤルドッジ',
    '1130',
    '1300',
    998,
    17415872,
    8499407802,
    '競技詳細\n王様ドッジに近い形式',
    '1,3,5,7位の得点を順に採用する）',
  ],
  [
    '昼休憩＋コスプレ大会',
    '1300',
    '1400',
    13,
    224913,
    1509938,
    '当日の審査は8チームで実施',
    '当日の審査は8チームで実施',
  ],
  [
    '出席確認②',
    '1300',
    '1330',
    15,
    115910,
    1065918,
    '13:30締切。FXカウント2',
    '13:30締切。FXカウント2',
  ],
  [
    '紙飛行機飛ばし',
    '1400',
    '1500',
    708,
    12393024,
    4234453446,
    '## 競技詳細\n\nコート内の助走ゾーン',
    '6位以下得点なし',
  ],
  [
    '学科別対抗リレー',
    '1500',
    '1530',
    672,
    9238795,
    3274536805,
    '## 競技詳細\n\n～ルール～',
    '全てのクラスが100点を獲得する)',
  ],
  ['出席確認③', '1530', '1540', 7, 53483, 341114, '15:40締切', '15:40締切'],
  [
    '表彰式・閉会式',
    '1540',
    '1600',
    10,
    240879,
    1260624,
    '表彰式と閉会式を実施',
    '表彰式と閉会式を実施',
  ],
] as const;
const names = expectedEvents.map(([name]) => name);
const expectedVenues = [
  ['出席確認①', '未定（仮）'],
  ['開会式', '未定（仮）'],
  ['走れ！○人○脚！', 'コートC'],
  ['ロイヤルドッジ', 'メインアリーナ'],
  ['ロイヤルドッジ', 'サブアリーナ'],
  ['昼休憩＋コスプレ大会', '未定（仮）'],
  ['出席確認②', '未定（仮）'],
  ['紙飛行機飛ばし', 'コートB'],
  ['学科別対抗リレー', 'コートA'],
  ['出席確認③', '未定（仮）'],
  ['表彰式・閉会式', '未定（仮）'],
] as const;
const expectedGatherings = [
  ['走れ！○人○脚！', 1, '10:20', '体育館A'],
  ['走れ！○人○脚！', 2, '10:45', '体育館A'],
  ['走れ！○人○脚！', 3, '11:00', '未定（仮）'],
  ['走れ！○人○脚！', 4, '11:15', '未定（仮）'],
  ['ロイヤルドッジ', 1, '11:30', '未定（仮）'],
  ['ロイヤルドッジ', 2, '11:50', '未定（仮）'],
  ['ロイヤルドッジ', 3, '12:10', '未定（仮）'],
  ['ロイヤルドッジ', 4, '12:30', '未定（仮）'],
  ['紙飛行機飛ばし', 1, '14:00', '未定（仮）'],
  ['紙飛行機飛ばし', 2, '14:15', '未定（仮）'],
  ['紙飛行機飛ばし', 3, '14:30', '未定（仮）'],
  ['紙飛行機飛ばし', 4, '14:45', '未定（仮）'],
  ['学科別対抗リレー', 1, '15:00', '未定（仮）'],
  ['学科別対抗リレー', 2, '15:15', '未定（仮）'],
] as const;
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
    "DELETE FROM gathering_spots WHERE gathering_spot_name IN ('未定（仮）', '体育館A', '552対象外集合場所')"
  );
  await execute(
    "DELETE FROM venues WHERE venue_name IN ('未定（仮）', 'コートA', 'コートB', 'コートC', 'メインアリーナ', 'サブアリーナ', '552対象外会場')"
  );
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

describe('stagingの正式スケジュール登録SQL', () => {
  it('10イベント・11実施場所・14 Roundを参加者なしで再現し、再実行しても変わらない', async () => {
    await runRegistration();

    const events = await rows(
      `WITH RECURSIVE
       target AS (
         SELECT * FROM events
         WHERE event_name IN (${names.map(() => '?').join(', ')})
       ),
       chars(event_id, rule_text, pos) AS (
         SELECT event_id, rule_text, 1 FROM target
         UNION ALL
         SELECT event_id, rule_text, pos + 1
         FROM chars
         WHERE pos < length(rule_text)
       ),
       fingerprints AS (
         SELECT event_id,
                SUM(unicode(substr(rule_text, pos, 1))) AS codepoint_sum,
                SUM(pos * unicode(substr(rule_text, pos, 1))) AS weighted_sum
         FROM chars
         GROUP BY event_id
       )
       SELECT target.event_name, target.start_time, target.end_time,
              length(target.rule_text) AS rule_length, target.rule_text,
              fingerprints.codepoint_sum, fingerprints.weighted_sum
       FROM target
       JOIN fingerprints ON fingerprints.event_id = target.event_id
       ORDER BY target.event_id`,
      ...names
    );
    expect(events).toHaveLength(10);
    expectedEvents.forEach(
      (
        [
          eventName,
          startTime,
          endTime,
          ruleLength,
          codepointSum,
          weightedSum,
          prefix,
          suffix,
        ],
        index
      ) => {
        expect(events[index]).toMatchObject({
          event_name: eventName,
          start_time: startTime,
          end_time: endTime,
          rule_length: ruleLength,
          codepoint_sum: codepointSum,
          weighted_sum: weightedSum,
        });
        expect((events[index].rule_text as string).startsWith(prefix)).toBe(
          true
        );
        expect((events[index].rule_text as string).endsWith(suffix)).toBe(true);
      }
    );

    expect(
      await rows(
        `SELECT event.event_name, venue.venue_name
         FROM event_venues AS event_venue
         JOIN events AS event ON event.event_id = event_venue.event_id
         JOIN venues AS venue ON venue.venue_id = event_venue.venue_id
         WHERE event.event_name IN (${names.map(() => '?').join(', ')})
         ORDER BY event.event_id, event_venue.event_venue_id`,
        ...names
      )
    ).toEqual(
      expectedVenues.map(([event_name, venue_name]) => ({
        event_name,
        venue_name,
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
         ORDER BY event.event_id, gathering.round`,
        ...names
      )
    ).toEqual(
      expectedGatherings.map(
        ([event_name, round, gathering_time, gathering_spot_name]) => ({
          event_name,
          round,
          gathering_time,
          round_start_time: null,
          gathering_spot_name,
          members: 0,
        })
      )
    );

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
    expect(verification[1].results).toHaveLength(11);
    expect(verification[2].results).toHaveLength(14);
    expect(verification[3].results).toEqual([]);

    const registered = await snapshot();
    await runRegistration();
    expect(await snapshot()).toEqual(registered);
  });

  it('対象外の既存データを変更しない', async () => {
    const event = await env.DB.prepare(
      `INSERT INTO events (event_name, start_time, end_time, rule_text)
       VALUES ('552対象外イベント', '0800', '0900', '対象外')
       RETURNING event_id`
    ).first<{ event_id: number }>();
    const venue = await env.DB.prepare(
      "INSERT INTO venues (venue_name) VALUES ('552対象外会場') RETURNING venue_id"
    ).first<{ venue_id: number }>();
    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('552対象外集合場所') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();
    await execute(
      'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)',
      event!.event_id,
      venue!.venue_id
    );
    await execute(
      `INSERT INTO gatherings
         (event_id, gathering_spot_id, round, gathering_time, round_start_time)
       VALUES (?, ?, 3, '07:50', '0800')`,
      event!.event_id,
      spot!.gathering_spot_id
    );
    const before = await snapshot();

    await runRegistration();

    const after = await snapshot();
    for (const table of [
      'events',
      'event_venues',
      'venues',
      'gatherings',
      'gathering_spots',
    ]) {
      expect(after[table]).toEqual(expect.arrayContaining(before[table]));
    }
  });

  it('削除migrationの履歴がなければ、作業テーブルも残さず停止する', async () => {
    await execute('DELETE FROM d1_migrations WHERE name = ?', cleanupMigration);
    await expectRejectedWithoutChanges();
  });

  it('同名イベントが複数ある場合は停止する', async () => {
    for (let index = 0; index < 2; index += 1) {
      await execute(
        `INSERT INTO events (event_name, start_time, end_time, rule_text)
         VALUES ('走れ！○人○脚！', '1030', '1130', '不一致')`
      );
    }
    await expectRejectedWithoutChanges();
  });

  it.each([
    ['開始時刻', '1000', '1130', '不一致'],
    ['終了時刻', '1030', '1200', '不一致'],
    ['ルール', '1030', '1130', '不一致'],
  ])('既存イベントの%sが異なる場合は停止する', async (_, start, end, rule) => {
    await execute(
      `INSERT INTO events (event_name, start_time, end_time, rule_text)
       VALUES ('走れ！○人○脚！', ?, ?, ?)`,
      start,
      end,
      rule
    );
    await expectRejectedWithoutChanges();
  });

  it('必要な集合場所が複数ある場合は停止する', async () => {
    await execute(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('未定（仮）')"
    );
    await execute(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('未定（仮）')"
    );
    await expectRejectedWithoutChanges();
  });

  it('既存イベントに想定外の実施場所がある場合は停止する', async () => {
    await runRegistration();
    const event = await env.DB.prepare(
      "SELECT event_id FROM events WHERE event_name = '走れ！○人○脚！'"
    ).first<{ event_id: number }>();
    const venue = await env.DB.prepare(
      "INSERT INTO venues (venue_name) VALUES ('552対象外会場') RETURNING venue_id"
    ).first<{ venue_id: number }>();
    await execute(
      'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)',
      event!.event_id,
      venue!.venue_id
    );
    await expectRejectedWithoutChanges();
  });

  it('既存イベントに想定外のRoundがある場合は停止する', async () => {
    await runRegistration();
    const event = await env.DB.prepare(
      "SELECT event_id FROM events WHERE event_name = '走れ！○人○脚！'"
    ).first<{ event_id: number }>();
    const spot = await env.DB.prepare(
      "SELECT gathering_spot_id FROM gathering_spots WHERE gathering_spot_name = '未定（仮）'"
    ).first<{ gathering_spot_id: number }>();
    await execute(
      `INSERT INTO gatherings
         (event_id, gathering_spot_id, round, gathering_time, round_start_time)
       VALUES (?, ?, 5, '11:20', NULL)`,
      event!.event_id,
      spot!.gathering_spot_id
    );
    await expectRejectedWithoutChanges();
  });

  it('既存Roundに参加者がいる場合は停止する', async () => {
    await runRegistration();
    const gathering = await env.DB.prepare(
      `SELECT gathering.gathering_id
       FROM gatherings AS gathering
       JOIN events AS event ON event.event_id = gathering.event_id
       WHERE event.event_name = '走れ！○人○脚！' AND gathering.round = 1`
    ).first<{ gathering_id: number }>();
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('552対象外ユーザー') RETURNING user_id"
    ).first<{ user_id: number }>();
    await execute(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)',
      gathering!.gathering_id,
      user!.user_id
    );
    await expectRejectedWithoutChanges();
  });
});
