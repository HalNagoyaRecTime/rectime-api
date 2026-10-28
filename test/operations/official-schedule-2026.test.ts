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
    '第一競技「走れ！○人○脚！」',
    '1030',
    '1130',
    371,
    4980816,
    948472566,
    '## ルール\n\n### 1. グループ分け',
    '- 予定競技時間：50分',
  ],
  [
    '第二競技「ロイヤルドッジ」',
    '1130',
    '1300',
    947,
    14932495,
    7043384931,
    '王様ドッジに近い形式のドッジボール。',
    '- 点数配分：試合終了時、「得点について」の計算方法により、そのチームの獲得点数を決める。',
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
    '第三競技「紙飛行機飛ばし」',
    '1400',
    '1500',
    585,
    10148912,
    3040355551,
    'コート内の助走ゾーンからライン手前の好きな場所へ移動し、',
    '- 投げ終えた参加者はコート内に入らず退場する。',
  ],
  [
    '第四競技「学科別対抗リレー」',
    '1500',
    '1530',
    319,
    3394946,
    602491730,
    '## ルール\n\n各学科の代表学生は16名。',
    '2. 赤・ピンク・白・黄・青・緑のBチーム',
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
  ['出席確認①', '体育館'],
  ['開会式', '体育館'],
  ['第一競技「走れ！○人○脚！」', 'コートC'],
  ['第二競技「ロイヤルドッジ」', 'メインアリーナ'],
  ['第二競技「ロイヤルドッジ」', 'サブアリーナ'],
  ['昼休憩＋コスプレ大会', '体育館'],
  ['出席確認②', '体育館'],
  ['第三競技「紙飛行機飛ばし」', 'コートB'],
  ['第四競技「学科別対抗リレー」', 'コートA'],
  ['出席確認③', '体育館'],
  ['表彰式・閉会式', '体育館'],
] as const;
const expectedGatherings = [
  ['第一競技「走れ！○人○脚！」', 1, '10:20', '体育館A'],
  ['第一競技「走れ！○人○脚！」', 2, '10:40', '体育館A'],
  ['第一競技「走れ！○人○脚！」', 3, '11:00', '未定（仮）'],
  ['第二競技「ロイヤルドッジ」', 1, '11:20', '未定（仮）'],
  ['第二競技「ロイヤルドッジ」', 2, '11:31', '未定（仮）'],
  ['第二競技「ロイヤルドッジ」', 3, '11:42', '未定（仮）'],
  ['第二競技「ロイヤルドッジ」', 4, '11:53', '未定（仮）'],
  ['第二競技「ロイヤルドッジ」', 5, '12:05', '未定（仮）'],
  ['第二競技「ロイヤルドッジ」', 6, '12:16', '未定（仮）'],
  ['第二競技「ロイヤルドッジ」', 7, '12:27', '未定（仮）'],
  ['第二競技「ロイヤルドッジ」', 8, '12:38', '未定（仮）'],
  ['第三競技「紙飛行機飛ばし」', 1, '13:50', '未定（仮）'],
  ['第三競技「紙飛行機飛ばし」', 2, '14:05', '未定（仮）'],
  ['第三競技「紙飛行機飛ばし」', 3, '14:20', '未定（仮）'],
  ['第三競技「紙飛行機飛ばし」', 4, '14:35', '未定（仮）'],
  ['第四競技「学科別対抗リレー」', 1, '14:50', '未定（仮）'],
] as const;
const expectedGatheringSpots = ['体育館A', '体育館B', '体育館C', '未定（仮）'];
const legacyNames = [
  '走れ！○人○脚！',
  'ロイヤルドッジ',
  '第二競技「ドッジボール」',
  '紙飛行機飛ばし',
  '学科別対抗リレー',
] as const;
const allTestNames = [...names, ...legacyNames, '552対象外イベント'];
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

async function runVerification() {
  return env.DB.batch<Row>(
    verificationSql
      .split(';')
      .map(query => query.trim())
      .filter(Boolean)
      .map(query => env.DB.prepare(query))
  );
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
    "DELETE FROM gathering_spots WHERE gathering_spot_name IN ('未定（仮）', '体育館A', '体育館B', '体育館C', '552対象外集合場所')"
  );
  await execute(
    "DELETE FROM venues WHERE venue_name IN ('未定（仮）', '体育館', 'コートA', 'コートB', 'コートC', 'メインアリーナ', 'サブアリーナ', '552対象外会場')"
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

describe('event.mdの正式スケジュール登録SQL', () => {
  it('10イベント・11実施場所・16 Round・4集合場所を参加者なしで登録し、再実行しても変わらない', async () => {
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

    const verification = await runVerification();
    expect(verification).toHaveLength(5);
    expect(verification[0].results).toHaveLength(10);
    expect(
      verification[0].results.every(row => row.registration_status === '正常')
    ).toBe(true);
    expect(verification[1].results).toHaveLength(11);
    expect(verification[2].results).toHaveLength(16);
    expect(verification[3].results).toHaveLength(4);
    expect(
      verification[3].results.map(row => row.gathering_spot_name).sort()
    ).toEqual([...expectedGatheringSpots].sort());
    expect(
      verification[3].results.every(row => row.registration_status === '正常')
    ).toBe(true);
    expect(verification[4].results).toEqual([]);

    const registered = await snapshot();
    await runRegistration();
    expect(await snapshot()).toEqual(registered);
  });

  it('一致する既存イベント・会場・集合場所のIDを再利用し、不足分だけ追加する', async () => {
    const event = await env.DB.prepare(
      `INSERT INTO events (event_name, start_time, end_time, rule_text)
       VALUES ('出席確認①', '0930', '1000', '10:00締切')
       RETURNING event_id`
    ).first<{ event_id: number }>();
    const venue = await env.DB.prepare(
      "INSERT INTO venues (venue_name) VALUES ('体育館') RETURNING venue_id"
    ).first<{ venue_id: number }>();
    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('体育館A') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();

    await runRegistration();

    expect(
      await rows(
        `SELECT event.event_id, venue.venue_id
         FROM events AS event
         JOIN event_venues AS event_venue ON event_venue.event_id = event.event_id
         JOIN venues AS venue ON venue.venue_id = event_venue.venue_id
         WHERE event.event_name = '出席確認①'`
      )
    ).toEqual([{ event_id: event!.event_id, venue_id: venue!.venue_id }]);
    expect(
      await rows(
        "SELECT gathering_spot_id FROM gathering_spots WHERE gathering_spot_name = '体育館A'"
      )
    ).toEqual([{ gathering_spot_id: spot!.gathering_spot_id }]);
    const verification = await runVerification();
    expect(
      verification[0].results.every(row => row.registration_status === '正常')
    ).toBe(true);
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

  it.each(legacyNames)(
    '旧名称「%s」がある場合は変更せず停止する',
    async name => {
      await execute(
        `INSERT INTO events (event_name, start_time, end_time, rule_text)
       VALUES (?, '1030', '1130', '旧名称の既存データ')`,
        name
      );
      await expectRejectedWithoutChanges();

      const verification = await runVerification();
      expect(verification[0].results).toHaveLength(10);
      expect(
        verification[0].results.every(
          row => row.registration_status === '旧名称イベントあり'
        )
      ).toBe(true);
    }
  );

  it('同名イベントが複数ある場合は停止する', async () => {
    for (let index = 0; index < 2; index += 1) {
      await execute(
        `INSERT INTO events (event_name, start_time, end_time, rule_text)
         VALUES ('出席確認①', '0930', '1000', '10:00締切')`
      );
    }
    await expectRejectedWithoutChanges();
  });

  it.each([
    ['開始時刻', '0900', '1000', '10:00締切'],
    ['終了時刻', '0930', '1030', '10:00締切'],
    ['ルール', '0930', '1000', '不一致'],
  ])('既存イベントの%sが異なる場合は停止する', async (_, start, end, rule) => {
    await execute(
      `INSERT INTO events (event_name, start_time, end_time, rule_text)
       VALUES ('出席確認①', ?, ?, ?)`,
      start,
      end,
      rule
    );
    await expectRejectedWithoutChanges();
  });

  it.each(expectedGatheringSpots)(
    '集合場所「%s」が複数ある場合は停止する',
    async name => {
      await execute(
        'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?)',
        name
      );
      await execute(
        'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?)',
        name
      );
      await expectRejectedWithoutChanges();
    }
  );

  it('既存イベントに想定外の実施場所がある場合は停止する', async () => {
    await runRegistration();
    const event = await env.DB.prepare(
      "SELECT event_id FROM events WHERE event_name = '第一競技「走れ！○人○脚！」'"
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

  it.each([
    ['第一競技「走れ！○人○脚！」', 4, '11:15'],
    ['第四競技「学科別対抗リレー」', 2, '15:15'],
  ])(
    '既存イベント「%s」に廃止したRound %sがある場合は停止する',
    async (name, round, time) => {
      await runRegistration();
      const event = await env.DB.prepare(
        'SELECT event_id FROM events WHERE event_name = ?'
      )
        .bind(name)
        .first<{ event_id: number }>();
      const spot = await env.DB.prepare(
        "SELECT gathering_spot_id FROM gathering_spots WHERE gathering_spot_name = '未定（仮）'"
      ).first<{ gathering_spot_id: number }>();
      await execute(
        `INSERT INTO gatherings
         (event_id, gathering_spot_id, round, gathering_time, round_start_time)
       VALUES (?, ?, ?, ?, NULL)`,
        event!.event_id,
        spot!.gathering_spot_id,
        round,
        time
      );
      await expectRejectedWithoutChanges();
    }
  );

  it('既存Roundに参加者がいる場合は停止する', async () => {
    await runRegistration();
    const gathering = await env.DB.prepare(
      `SELECT gathering.gathering_id
       FROM gatherings AS gathering
       JOIN events AS event ON event.event_id = gathering.event_id
       WHERE event.event_name = '第一競技「走れ！○人○脚！」' AND gathering.round = 1`
    ).first<{ gathering_id: number }>();
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('552対象外ユーザー') RETURNING user_id"
    ).first<{ user_id: number }>();
    await execute(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)',
      gathering!.gathering_id,
      user!.user_id
    );
    const verification = await runVerification();
    expect(
      verification[0].results.find(
        row => row.event_name === '第一競技「走れ！○人○脚！」'
      )?.registration_status
    ).toBe('参加者あり');
    await expectRejectedWithoutChanges();
  });

  it.each([
    [
      '出席確認①',
      'ルール不一致',
      "UPDATE events SET rule_text = '不一致' WHERE event_name = '出席確認①'",
    ],
    [
      '出席確認①',
      '実施場所不一致',
      `UPDATE event_venues
       SET venue_id = (SELECT venue_id FROM venues WHERE venue_name = 'コートA')
       WHERE event_id = (SELECT event_id FROM events WHERE event_name = '出席確認①')`,
    ],
    [
      '第一競技「走れ！○人○脚！」',
      'Round内容不一致',
      `UPDATE gatherings SET gathering_time = '10:21'
       WHERE event_id = (
         SELECT event_id FROM events WHERE event_name = '第一競技「走れ！○人○脚！」'
       ) AND round = 1`,
    ],
  ])('確認SQLが「%s」の%sを検出する', async (name, status, mutation) => {
    await runRegistration();
    await execute(mutation);

    const verification = await runVerification();
    expect(
      verification[0].results.find(row => row.event_name === name)
        ?.registration_status
    ).toBe(status);
    expect(
      verification[0].results
        .filter(row => row.event_name !== name)
        .every(row => row.registration_status === '正常')
    ).toBe(true);
  });

  it.each(['体育館B', '体育館C'])(
    '確認SQLがRoundで未使用の集合場所「%s」の不足と重複を検出する',
    async name => {
      await runRegistration();
      await execute(
        'DELETE FROM gathering_spots WHERE gathering_spot_name = ?',
        name
      );

      const missing = await runVerification();
      expect(
        missing[3].results.find(row => row.gathering_spot_name === name)
          ?.registration_status
      ).toBe('未登録');
      expect(
        missing[0].results.every(row => row.registration_status === '正常')
      ).toBe(true);

      await runRegistration();
      await execute(
        'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?)',
        name
      );
      const duplicate = await runVerification();
      expect(
        duplicate[3].results.find(row => row.gathering_spot_name === name)
          ?.registration_status
      ).toBe('名称重複');
    }
  );
});
