import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0047_remove_initial_dummy_data.sql'
  );
  if (!migration) {
    throw new Error('0047_remove_initial_dummy_data.sql が登録されていません');
  }
  return migration.queries;
})();

const regular = {
  user: 946101,
  student: 946102,
  team: 946103,
  classRoom: 946104,
  event: 946105,
  venue: 946106,
  spot: 946107,
  gathering: 946108,
  member: 946109,
  notification: 946110,
  schedule: 946111,
  audience: 946112,
  recipient: 946113,
  token: 946114,
  delivery: 946115,
  teacher: 946116,
  staff: 946117,
  link: 946118,
  score: 946119,
};

const initialEvents = [
  [
    1,
    'バスケットボール大会',
    '3on3バスケットボールトーナメント',
    '1100',
    '1300',
    '体育館',
  ],
  [
    2,
    '文化祭準備',
    '来月の文化祭に向けた展示物準備',
    '1400',
    '1600',
    '第1教室',
  ],
  [
    3,
    '英語スピーチコンテスト',
    '学年対抗英語プレゼンテーション大会',
    '1630',
    '1800',
    '講堂',
  ],
  [
    4,
    'プログラミング勉強会',
    'React/TypeScript実践セッション',
    '1900',
    '2100',
    'PC教室',
  ],
] as const;

const tables = {
  users: 'user_id',
  students: 'student_id',
  class_rooms: 'class_room_id',
  teams: 'team_id',
  team_scores: 'team_score_id',
  events: 'event_id',
  venues: 'venue_id',
  event_venues: 'event_venue_id',
  gathering_spots: 'gathering_spot_id',
  gatherings: 'gathering_id',
  gathering_group_members: 'gathering_group_member_id',
  microsoft_account_links: 'microsoft_account_link_id',
  staffs: 'staff_id',
  teachers: 'teacher_id',
  firebase_tokens: 'firebase_token_id',
  notifications: 'notification_id',
  notification_schedules: 'notification_schedule_id',
  notification_audiences: 'notification_audience_id',
  notification_recipients: 'notification_recipient_id',
  notification_push_deliveries: 'notification_push_delivery_id',
} as const;

type Table = keyof typeof tables;
type SqlValue = string | number | null;
type Row = Record<string, unknown>;

async function execute(sql: string, ...values: SqlValue[]): Promise<void> {
  await env.DB.prepare(sql).bind(...values).run();
}

async function runMigration(): Promise<void> {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

async function snapshot(): Promise<Record<string, Row[]>> {
  const result: Record<string, Row[]> = {};
  for (const [table, key] of Object.entries(tables)) {
    result[table] = (
      await env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${key}`).all<Row>()
    ).results;
  }
  result.sequences = (
    await env.DB.prepare(
      'SELECT name, seq FROM sqlite_sequence ORDER BY name'
    ).all<Row>()
  ).results;
  result.schema = (
    await env.DB.prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' ORDER BY name`
    ).all<Row>()
  ).results;
  return result;
}

// 各ケースで明示的に登録した行だけを、外部キーの子から片付ける。
async function cleanFixtures(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM notification_push_deliveries WHERE notification_push_delivery_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM notification_recipients WHERE notification_recipient_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM notification_audiences WHERE notification_audience_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM notification_schedules WHERE notification_schedule_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM notifications WHERE notification_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM microsoft_account_links WHERE microsoft_account_link_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM staffs WHERE staff_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      `UPDATE class_rooms SET teacher_id = NULL
       WHERE class_room_id IN (1, 2, 3, 946104)`
    ),
    env.DB.prepare(
      'DELETE FROM teachers WHERE teacher_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM gathering_group_members WHERE gathering_group_member_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM gatherings WHERE gathering_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM event_venues WHERE event_venue_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM events WHERE event_id IN (1, 2, 3, 4, 946105)'
    ),
    env.DB.prepare(
      'DELETE FROM students WHERE student_id IN (1, 2, 3, 4) OR student_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM class_rooms WHERE class_room_id IN (1, 2, 3, 946104)'
    ),
    env.DB.prepare(
      'DELETE FROM team_scores WHERE team_score_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare('DELETE FROM teams WHERE team_id IN (1, 2, 3, 946103)'),
    env.DB.prepare(
      'DELETE FROM firebase_tokens WHERE firebase_token_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM users WHERE user_id IN (1, 2, 3, 4, 5, 946101)'
    ),
    env.DB.prepare(
      'DELETE FROM venues WHERE venue_id BETWEEN 946001 AND 946199'
    ),
    env.DB.prepare(
      'DELETE FROM gathering_spots WHERE gathering_spot_id = 946107'
    ),
  ]);
}

async function insertFixtures(): Promise<void> {
  await execute(
    `INSERT INTO users (user_id, user_name) VALUES
     (1, '田中太郎'), (2, '佐藤花子'), (3, '鈴木一郎'),
     (4, '高橋美咲'), (5, '山田健太'), (?, '田中太郎')`,
    regular.user
  );
  await execute(
    `INSERT INTO teams (team_id, team_name) VALUES
     (1, '1年Aクラス(11A)'), (2, '1年Bクラス(11B)'),
     (3, '2年Aクラス(12A)'), (?, '正規チーム')`,
    regular.team
  );
  await execute(
    `INSERT INTO class_rooms
     (class_room_id, class_code, class_name, team_id) VALUES
     (1, '11A', '1年Aクラス', 1), (2, '11B', '1年Bクラス', 2),
     (3, '12A', '2年Aクラス', 3), (?, '46Z', '正規クラス', ?)`,
    regular.classRoom,
    regular.team
  );
  await execute(
    `INSERT INTO students
     (student_id, user_id, class_room_id, attendance_number, student_id_number)
     VALUES (1, 1, 1, 1, '10000'), (2, 2, 1, 2, '10001'),
     (3, 3, 2, 3, '10002'), (4, 4, 2, 4, '10003'),
     (?, ?, ?, 10, '0047-REGULAR')`,
    regular.student,
    regular.user,
    regular.classRoom
  );
  await execute(
    `INSERT INTO gathering_spots (gathering_spot_id, gathering_spot_name)
     VALUES (?, '体育館')`,
    regular.spot
  );
  for (const [id, name, rule, start, end, venue] of initialEvents) {
    await execute(
      `INSERT INTO events
       (event_id, event_name, rule_text, start_time, end_time)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      name,
      rule,
      start,
      end
    );
    await execute(
      'INSERT INTO venues (venue_id, venue_name) VALUES (?, ?)',
      946000 + id,
      venue
    );
    await execute(
      `INSERT INTO event_venues (event_venue_id, event_id, venue_id)
       VALUES (?, ?, ?)`,
      946030 + id,
      id,
      946000 + id
    );
    await execute(
      `INSERT INTO gatherings
       (gathering_id, event_id, gathering_spot_id, gathering_time, round)
       VALUES (?, ?, ?, '10:50', 1)`,
      946010 + id,
      id,
      regular.spot
    );
    await execute(
      `INSERT INTO gathering_group_members
       (gathering_group_member_id, gathering_id, user_id) VALUES (?, ?, ?)`,
      946020 + id,
      946010 + id,
      id
    );
  }
  await execute(
    `INSERT INTO events
     (event_id, event_name, rule_text, start_time, end_time)
     VALUES (?, 'バスケットボール大会', '正式な競技ルール', '09:00', '10:00')`,
    regular.event
  );
  await execute(
    'INSERT INTO venues (venue_id, venue_name) VALUES (?, ?)',
    regular.venue,
    '正規体育館'
  );
  await execute(
    `INSERT INTO event_venues (event_venue_id, event_id, venue_id)
     VALUES (946130, ?, ?)`,
    regular.event,
    regular.venue
  );
  await execute(
    `INSERT INTO gatherings
     (gathering_id, event_id, gathering_spot_id, gathering_time, round)
     VALUES (?, ?, ?, '08:50', 2)`,
    regular.gathering,
    regular.event,
    regular.spot
  );
  await execute(
    `INSERT INTO gathering_group_members
     (gathering_group_member_id, gathering_id, user_id) VALUES (?, ?, ?)`,
    regular.member,
    regular.gathering,
    regular.user
  );
  await execute(
    'INSERT INTO team_scores (team_score_id, team_id, scores) VALUES (?, ?, 15)',
    regular.score,
    regular.team
  );
  await execute(
    `INSERT INTO microsoft_account_links
     (microsoft_account_link_id, user_id, oid, tid)
     VALUES (?, ?, '0047-regular-oid', '0047-test-tenant')`,
    regular.link,
    regular.user
  );
  await execute(
    'INSERT INTO staffs (staff_id, user_id) VALUES (?, ?)',
    regular.staff,
    regular.user
  );
  await execute(
    'INSERT INTO teachers (teacher_id, user_id, email) VALUES (?, ?, ?)',
    regular.teacher,
    regular.user,
    '0047-regular@example.invalid'
  );
  await execute(
    `INSERT INTO firebase_tokens
     (firebase_token_id, user_id, platform, fcm_token) VALUES (?, ?, 1, ?)`,
    regular.token,
    regular.user,
    '0047-regular-token'
  );
  await execute(
    `INSERT INTO notifications
     (notification_id, created_by_user_id, push_title, push_body,
      notification_type, title, body, source_type, source_id, source_hash)
     VALUES (?, ?, '正規通知', '正規本文', 'gathering_reminder',
             '正規通知', '正規本文', 'gathering', ?, '0047-regular-hash')`,
    regular.notification,
    regular.user,
    regular.gathering
  );
  await execute(
    `INSERT INTO notification_schedules
     (notification_schedule_id, created_user_id, scheduled_by_user_id,
      event_id, notification_id, send_status, send_at)
     VALUES (?, ?, ?, ?, ?, 'scheduled', '2099-10-21T00:00:00.000Z')`,
    regular.schedule,
    regular.user,
    regular.user,
    regular.event,
    regular.notification
  );
  await execute(
    `INSERT INTO notification_audiences
     (notification_audience_id, notification_schedule_id, audience_type, target_id)
     VALUES (?, ?, 'gathering', ?)`,
    regular.audience,
    regular.schedule,
    regular.gathering
  );
  await execute(
    `INSERT INTO notification_recipients
     (notification_recipient_id, notification_schedule_id, user_id)
     VALUES (?, ?, ?)`,
    regular.recipient,
    regular.schedule,
    regular.user
  );
  await execute(
    `INSERT INTO notification_push_deliveries
     (notification_push_delivery_id, notification_recipient_id,
      firebase_token_id, platform, status) VALUES (?, ?, ?, 1, 'pending')`,
    regular.delivery,
    regular.recipient,
    regular.token
  );
}

describe('0047_remove_initial_dummy_data.sql', () => {
  beforeAll(async () => {
    // 0047適用時点の旧Schedule列を、0052適用後の現行スキーマへ復元する。
    await env.DB.batch([
      env.DB.prepare(
        'ALTER TABLE notification_schedules ADD COLUMN created_user_id INTEGER'
      ),
      env.DB.prepare(
        'ALTER TABLE notification_schedules ADD COLUMN event_id INTEGER'
      ),
    ]);
  });

  beforeEach(async () => {
    await cleanFixtures();
    await insertFixtures();
  });
  afterEach(cleanFixtures);

  it('初期ダミーと所属する集合だけを削除し、正規データと移行ユーザーを保持する', async () => {
    const before = await snapshot();
    expect(before.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: -1,
          user_name: 'システム移行ユーザー',
        }),
      ])
    );

    await runMigration();

    const deletedIds: Partial<Record<Table, number[]>> = {
      users: [1, 2, 3, 4, 5],
      students: [1, 2, 3, 4],
      class_rooms: [1, 2, 3],
      teams: [1, 2, 3],
      events: [1, 2, 3, 4],
      venues: [946001, 946002, 946003, 946004],
      event_venues: [946031, 946032, 946033, 946034],
      gatherings: [946011, 946012, 946013, 946014],
      gathering_group_members: [946021, 946022, 946023, 946024],
    };
    const expected = { ...before };
    for (const [table, key] of Object.entries(tables)) {
      const removed = deletedIds[table as Table] ?? [];
      expected[table] = before[table].filter(
        row => !removed.includes(Number(row[key]))
      );
    }
    expect(await snapshot()).toEqual(expected);
    expect(
      (await env.DB.prepare('PRAGMA foreign_key_check').all()).results
    ).toEqual([]);
  });

  it('適用済みの状態で再実行してもデータを変更しない', async () => {
    await runMigration();
    const before = await snapshot();

    await runMigration();

    expect(await snapshot()).toEqual(before);
  });

  it('同じコードと名称で再作成した別IDのクラスに移った学生を削除しない', async () => {
    await execute(
      "UPDATE class_rooms SET class_code = '0047-OLD' WHERE class_room_id = 1"
    );
    await execute(
      `UPDATE class_rooms SET class_code = '11A', class_name = '1年Aクラス'
       WHERE class_room_id = ?`,
      regular.classRoom
    );
    await execute(
      'UPDATE students SET class_room_id = ? WHERE student_id IN (1, 2)',
      regular.classRoom
    );
    await execute('DELETE FROM class_rooms WHERE class_room_id = 1');
    const before = await snapshot();

    await expect(runMigration()).rejects.toThrow(
      /dummy_data_has_no_unreviewed_relations/
    );

    expect(await snapshot()).toEqual(before);
  });

  describe('正規データとの関連を検出すると全体をロールバックする', () => {
    const relations: Array<[string, string, SqlValue[]]> = [
      [
        '氏名が変更された初期IDのStudentを削除しない',
        "UPDATE users SET user_name = '正規の登録氏名' WHERE user_id = 1",
        [],
      ],
      [
        'ルールが変更された初期IDのイベントを削除しない',
        "UPDATE events SET rule_text = '正式な競技ルール' WHERE event_id = 1",
        [],
      ],
      [
        '複数の実施場所を持つ初期IDのイベントを削除しない',
        'INSERT INTO event_venues (event_venue_id, event_id, venue_id) VALUES (946121, 1, ?)',
        [regular.venue],
      ],
      [
        '初期seedに学生情報のない山田健太にStudentが追加されている',
        `INSERT INTO students
         (student_id, user_id, class_room_id, attendance_number, student_id_number)
         VALUES (946121, 5, ?, 11, '0047-YAMADA')`,
        [regular.classRoom],
      ],
      [
        '対象クラスに正規Studentが所属する',
        'UPDATE students SET class_room_id = 1 WHERE student_id = ?',
        [regular.student],
      ],
      [
        '対象クラスに教員が設定されている',
        'UPDATE class_rooms SET teacher_id = ? WHERE class_room_id = 1',
        [regular.teacher],
      ],
      [
        '対象チームを正規クラスが共有する',
        'UPDATE class_rooms SET team_id = 1 WHERE class_room_id = ?',
        [regular.classRoom],
      ],
      [
        '対象チームに得点が登録されている',
        'INSERT INTO team_scores (team_score_id, team_id, scores) VALUES (946121, 1, 0)',
        [],
      ],
      [
        '対象実施場所を正規イベントが共有する',
        'INSERT INTO event_venues (event_venue_id, event_id, venue_id) VALUES (946121, ?, 946001)',
        [regular.event],
      ],
      [
        '初期ユーザーにMicrosoftアカウントが連携されている',
        `INSERT INTO microsoft_account_links
         (microsoft_account_link_id, user_id, oid, tid)
         VALUES (946121, 1, '0047-linked-oid', '0047-test-tenant')`,
        [],
      ],
      [
        '初期ユーザーに職員ロールが付いている',
        'INSERT INTO staffs (staff_id, user_id) VALUES (946121, 1)',
        [],
      ],
      [
        '初期ユーザーに教員ロールが付いている',
        `INSERT INTO teachers (teacher_id, user_id, email)
         VALUES (946121, 1, '0047-linked@example.invalid')`,
        [],
      ],
      [
        '初期ユーザーにFirebase Tokenが登録されている',
        `INSERT INTO firebase_tokens
         (firebase_token_id, user_id, platform, fcm_token)
         VALUES (946121, 1, 1, '0047-linked-token')`,
        [],
      ],
      [
        '初期ユーザーが正規イベントの集合に参加する',
        `INSERT INTO gathering_group_members
         (gathering_group_member_id, gathering_id, user_id) VALUES (946121, ?, 1)`,
        [regular.gathering],
      ],
      [
        '初期イベントの集合に正規ユーザーが参加する',
        `INSERT INTO gathering_group_members
         (gathering_group_member_id, gathering_id, user_id)
         VALUES (946121, 946011, ?)`,
        [regular.user],
      ],
      [
        '通知作成者が初期ユーザーである',
        'UPDATE notifications SET created_by_user_id = 1 WHERE notification_id = ?',
        [regular.notification],
      ],
      [
        '通知予約の作成者が初期ユーザーである',
        'UPDATE notification_schedules SET created_user_id = 1 WHERE notification_schedule_id = ?',
        [regular.schedule],
      ],
      [
        '通知予約の予約者が初期ユーザーである',
        'UPDATE notification_schedules SET scheduled_by_user_id = 1 WHERE notification_schedule_id = ?',
        [regular.schedule],
      ],
      [
        '通知予約の停止者が初期ユーザーである',
        'UPDATE notification_schedules SET stopped_by_user_id = 1 WHERE notification_schedule_id = ?',
        [regular.schedule],
      ],
      [
        '通知予約が初期イベントを参照する',
        'UPDATE notification_schedules SET event_id = 1 WHERE notification_schedule_id = ?',
        [regular.schedule],
      ],
      [
        '通知受信者が初期ユーザーである',
        'UPDATE notification_recipients SET user_id = 1 WHERE notification_recipient_id = ?',
        [regular.recipient],
      ],
      [
        'FKのない通知sourceが初期イベントの集合を参照する',
        'UPDATE notifications SET source_id = 946011 WHERE notification_id = ?',
        [regular.notification],
      ],
      ...([
        ['user', 1],
        ['class_room', 1],
        ['event', 1],
        ['gathering', 946011],
      ] as const).map(
        ([type, id]): [string, string, SqlValue[]] => [
          `FKのない通知audienceが対象${type}を参照する`,
          `UPDATE notification_audiences SET audience_type = ?, target_id = ?
           WHERE notification_audience_id = ?`,
          [type, id, regular.audience],
        ]
      ),
    ];

    it.each(relations)('%s', async (_label, sql, values) => {
      await execute(sql, ...values);
      const before = await snapshot();

      await expect(runMigration()).rejects.toThrow(
        /dummy_data_has_no_unreviewed_relations/
      );

      expect(await snapshot()).toEqual(before);
    });
  });
});
