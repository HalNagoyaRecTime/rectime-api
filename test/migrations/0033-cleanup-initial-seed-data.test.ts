import { env } from 'cloudflare:workers';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0033_cleanup_initial_seed_data.sql'
  );
  if (!migration) {
    throw new Error('0033_cleanup_initial_seed_data.sqlが登録されていません');
  }
  return migration.queries;
})();

async function runMigration(queryCount = migrationQueries.length) {
  for (const query of migrationQueries.slice(0, queryCount)) {
    await env.DB.prepare(query).run();
  }
}

async function resetDatabase() {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM notification_schedules'),
    env.DB.prepare('DELETE FROM gathering_group_members'),
    env.DB.prepare('DELETE FROM gatherings'),
    env.DB.prepare('DELETE FROM students'),
    env.DB.prepare('DELETE FROM class_rooms'),
    env.DB.prepare('DELETE FROM staffs'),
    env.DB.prepare('DELETE FROM teachers'),
    env.DB.prepare('DELETE FROM microsoft_account_links'),
    env.DB.prepare('DELETE FROM firebase_tokens'),
    env.DB.prepare('DELETE FROM events'),
    env.DB.prepare('DELETE FROM notifications'),
    env.DB.prepare('DELETE FROM gathering_spots'),
    env.DB.prepare('DELETE FROM users WHERE user_id <> -1'),
  ]);
}

async function insertExactSeeds() {
  const timestamp = '2024-01-01 00:00:00';

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (
        user_id, user_name, is_live_active, deletion_status,
        deletion_requested_at, deleted_at, purged_at, created_at, updated_at
      ) VALUES
        (1, '田中太郎', 1, 'active', NULL, NULL, NULL, ?, ?),
        (2, '佐藤花子', 1, 'active', NULL, NULL, NULL, ?, ?),
        (3, '鈴木一郎', 1, 'active', NULL, NULL, NULL, ?, ?),
        (4, '高橋美咲', 1, 'active', NULL, NULL, NULL, ?, ?),
        (5, '山田健太', 1, 'active', NULL, NULL, NULL, ?, ?)`
    ).bind(
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp
    ),
    env.DB.prepare(
      `INSERT INTO class_rooms (
        class_room_id, class_code, class_name, teacher_id, created_at, updated_at
      ) VALUES
        (1, '11A', '1年Aクラス', NULL, ?, ?),
        (2, '11B', '1年Bクラス', NULL, ?, ?),
        (3, '12A', '2年Aクラス', NULL, ?, ?)`
    ).bind(timestamp, timestamp, timestamp, timestamp, timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO students (
        student_id, user_id, class_room_id, attendance_number,
        student_id_number, created_at, updated_at
      ) VALUES
        (1, 1, 1, 1, '10000', ?, ?),
        (2, 2, 1, 2, '10001', ?, ?),
        (3, 3, 2, 3, '10002', ?, ?),
        (4, 4, 2, 4, '10003', ?, ?)`
    ).bind(
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp
    ),
    env.DB.prepare(
      `INSERT INTO events (
        event_id, event_name, rule_text, venue, start_time, end_time,
        created_at, updated_at
      ) VALUES
        (1, 'バスケットボール大会', '3on3バスケットボールトーナメント', '体育館', '1100', '1300', ?, ?),
        (2, '文化祭準備', '来月の文化祭に向けた展示物準備', '第1教室', '1400', '1600', ?, ?),
        (3, '英語スピーチコンテスト', '学年対抗英語プレゼンテーション大会', '講堂', '1630', '1800', ?, ?),
        (4, 'プログラミング勉強会', 'React/TypeScript実践セッション', 'PC教室', '1900', '2100', ?, ?)`
    ).bind(
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp,
      timestamp
    ),
  ]);
}

async function insertLookalikeRows() {
  const timestamp = '2024-01-01 00:00:00';

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (
        user_id, user_name, created_at, updated_at
      ) VALUES (9001, '田中太郎', ?, ?)`
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO class_rooms (
        class_room_id, class_code, class_name, created_at, updated_at
      ) VALUES (9001, '91A', '1年Aクラス', ?, ?)`
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO students (
        student_id, user_id, class_room_id, attendance_number,
        student_id_number, created_at, updated_at
      ) VALUES (9001, 9001, 9001, 1, '90001', ?, ?)`
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO events (
        event_id, event_name, rule_text, venue, start_time, end_time,
        created_at, updated_at
      ) VALUES (
        9001, 'バスケットボール大会',
        '3on3バスケットボールトーナメント', '体育館',
        '1100', '1300', ?, ?
      )`
    ).bind(timestamp, timestamp),
  ]);
}

async function insertGathering(eventId: number) {
  await env.DB.prepare(
    `INSERT INTO gathering_spots (
      gathering_spot_id, gathering_spot_name
    ) VALUES (9100, '0033移行確認場所')`
  ).run();
  await env.DB.prepare(
    `INSERT INTO gatherings (
      gathering_id, event_id, gathering_spot_id
    ) VALUES (9100, ?, 9100)`
  )
    .bind(eventId)
    .run();
}

async function insertNotificationSchedule(options: {
  createdUserId?: number;
  eventId?: number;
}) {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (user_id, user_name) VALUES (9100, '0033通知先利用者')"
    ),
    env.DB.prepare(
      `INSERT INTO firebase_tokens (
        firebase_token_id, user_id, platform, fcm_token
      ) VALUES (9100, 9100, 2, '0033-notification-token')`
    ),
    env.DB.prepare(
      `INSERT INTO notifications (
        notification_id, notification_type, title, body
      ) VALUES (9100, 'manual', '0033移行確認', '0033移行確認')`
    ),
  ]);
  await env.DB.prepare(
    `INSERT INTO notification_schedules (
      notification_schedule_id, created_user_id, event_id,
      notification_id, firebase_token_id, send_at
    ) VALUES (9100, ?, ?, 9100, 9100, '2026-09-18 09:00:00')`
  )
    .bind(options.createdUserId ?? null, options.eventId ?? null)
    .run();
}

async function getSeedCounts() {
  const results = await env.DB.batch<{ row_count: number }>([
    env.DB.prepare(
      'SELECT COUNT(*) AS row_count FROM events WHERE event_id BETWEEN 1 AND 4'
    ),
    env.DB.prepare(
      'SELECT COUNT(*) AS row_count FROM users WHERE user_id BETWEEN 1 AND 5'
    ),
    env.DB.prepare(
      'SELECT COUNT(*) AS row_count FROM students WHERE student_id BETWEEN 1 AND 4'
    ),
    env.DB.prepare(
      'SELECT COUNT(*) AS row_count FROM class_rooms WHERE class_room_id BETWEEN 1 AND 3'
    ),
  ]);

  return results.map(result => result.results[0]?.row_count ?? -1);
}

async function expectForeignKeysToBeValid() {
  const errors = await env.DB.prepare('PRAGMA foreign_key_check').all();
  expect(errors.results).toEqual([]);
}

describe('0033_cleanup_initial_seed_data.sql', () => {
  let appliedMigrationSeedCounts: number[];
  let appliedMigrationSystemUserName: string | undefined;
  let appliedMigrationForeignKeyErrors: unknown[];

  beforeAll(async () => {
    appliedMigrationSeedCounts = await getSeedCounts();
    const systemUser = await env.DB.prepare(
      'SELECT user_name FROM users WHERE user_id = -1'
    ).first<{ user_name: string }>();
    appliedMigrationSystemUserName = systemUser?.user_name;
    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    appliedMigrationForeignKeyErrors = foreignKeyErrors.results;
  });

  beforeEach(resetDatabase);
  afterEach(resetDatabase);

  it('空DBへの全migration適用後に初期サンプルが残らない', () => {
    expect(appliedMigrationSeedCounts).toEqual([0, 0, 0, 0]);
    expect(appliedMigrationSystemUserName).toBe('システム移行ユーザー');
    expect(appliedMigrationForeignKeyErrors).toEqual([]);
  });

  it('初期サンプルだけを削除し、システム利用者と似たデータを保持する', async () => {
    await insertExactSeeds();
    await insertLookalikeRows();

    await runMigration();

    expect(await getSeedCounts()).toEqual([0, 0, 0, 0]);
    const systemUser = await env.DB.prepare(
      'SELECT user_name FROM users WHERE user_id = -1'
    ).first<{ user_name: string }>();
    expect(systemUser?.user_name).toBe('システム移行ユーザー');

    const lookalikeCounts = await env.DB.batch<{ row_count: number }>([
      env.DB.prepare(
        'SELECT COUNT(*) AS row_count FROM events WHERE event_id = 9001'
      ),
      env.DB.prepare(
        'SELECT COUNT(*) AS row_count FROM users WHERE user_id = 9001'
      ),
      env.DB.prepare(
        'SELECT COUNT(*) AS row_count FROM students WHERE student_id = 9001'
      ),
      env.DB.prepare(
        'SELECT COUNT(*) AS row_count FROM class_rooms WHERE class_room_id = 9001'
      ),
    ]);
    expect(
      lookalikeCounts.map(result => result.results[0]?.row_count)
    ).toEqual([1, 1, 1, 1]);
    await expectForeignKeysToBeValid();
  });

  it('利用者に関連データがあれば、対応する学生と教室も保持する', async () => {
    const protections = [
      {
        name: 'Microsoftアカウント',
        insert: () =>
          env.DB.prepare(
            `INSERT INTO microsoft_account_links (user_id, oid, tid)
             VALUES (1, '0033-oid', '0033-tid')`
          ).run(),
      },
      {
        name: 'Firebaseトークン',
        insert: () =>
          env.DB.prepare(
            `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
             VALUES (1, 2, '0033-user-token')`
          ).run(),
      },
      {
        name: '職員情報',
        insert: () =>
          env.DB.prepare('INSERT INTO staffs (user_id) VALUES (1)').run(),
      },
      {
        name: '教員情報',
        insert: () =>
          env.DB.prepare(
            "INSERT INTO teachers (user_id, email) VALUES (1, '0033@example.com')"
          ).run(),
      },
      {
        name: '集合メンバー',
        insert: async () => {
          await env.DB.prepare(
            `INSERT INTO events (
              event_id, event_name, venue, start_time, end_time
            ) VALUES (9100, '0033集合確認', '体育館', '0900', '1000')`
          ).run();
          await insertGathering(9100);
          await env.DB.prepare(
            `INSERT INTO gathering_group_members (gathering_id, user_id)
             VALUES (9100, 1)`
          ).run();
        },
      },
      {
        name: '通知予定の作成者',
        insert: () => insertNotificationSchedule({ createdUserId: 1 }),
      },
    ];

    for (const protection of protections) {
      await resetDatabase();
      await insertExactSeeds();
      await protection.insert();

      await runMigration();

      const protectedCounts = await env.DB.batch<{ row_count: number }>([
        env.DB.prepare(
          'SELECT COUNT(*) AS row_count FROM users WHERE user_id = 1'
        ),
        env.DB.prepare(
          'SELECT COUNT(*) AS row_count FROM students WHERE student_id = 1'
        ),
        env.DB.prepare(
          'SELECT COUNT(*) AS row_count FROM class_rooms WHERE class_room_id = 1'
        ),
      ]);
      expect(
        protectedCounts.map(result => result.results[0]?.row_count),
        protection.name
      ).toEqual([1, 1, 1]);
      await expectForeignKeysToBeValid();
    }
  });

  it('イベントに集合または通知予定があれば保持する', async () => {
    const protections = [
      {
        name: '集合',
        insert: () => insertGathering(1),
      },
      {
        name: '通知予定',
        insert: () => insertNotificationSchedule({ eventId: 1 }),
      },
    ];

    for (const protection of protections) {
      await resetDatabase();
      await insertExactSeeds();
      await protection.insert();

      await runMigration();

      const event = await env.DB.prepare(
        'SELECT event_name FROM events WHERE event_id = 1'
      ).first<{ event_name: string }>();
      expect(event?.event_name, protection.name).toBe('バスケットボール大会');
      await expectForeignKeysToBeValid();
    }
  });

  it('初期教室に別の学生が在籍していれば教室を保持する', async () => {
    await insertExactSeeds();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (user_id, user_name) VALUES (9300, '正規在籍者')"
      ),
      env.DB.prepare(
        `INSERT INTO students (
          student_id, user_id, class_room_id, attendance_number,
          student_id_number
        ) VALUES (9300, 9300, 1, 30, '0033-real-student')`
      ),
    ]);

    await runMigration();

    const remainingRows = await env.DB.batch<{ row_count: number }>([
      env.DB.prepare(
        'SELECT COUNT(*) AS row_count FROM class_rooms WHERE class_room_id = 1'
      ),
      env.DB.prepare(
        'SELECT COUNT(*) AS row_count FROM students WHERE student_id = 9300'
      ),
      env.DB.prepare(
        'SELECT COUNT(*) AS row_count FROM students WHERE student_id IN (1, 2)'
      ),
    ]);
    expect(remainingRows.map(result => result.results[0]?.row_count)).toEqual([
      1, 1, 0,
    ]);
    await expectForeignKeysToBeValid();
  });

  it('初期値から変更されたデータと、その参照先を保持する', async () => {
    await insertExactSeeds();
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE events SET venue = '第2体育館' WHERE event_id = 1"
      ),
      env.DB.prepare(
        "UPDATE events SET updated_at = '2024-01-02 00:00:00' WHERE event_id = 2"
      ),
      env.DB.prepare(
        'UPDATE students SET attendance_number = 99 WHERE student_id = 1'
      ),
      env.DB.prepare(
        "UPDATE users SET user_name = '佐藤花子（確認済み）' WHERE user_id = 2"
      ),
      env.DB.prepare(
        `UPDATE users
         SET deletion_status = 'deletion_pending',
             deletion_requested_at = '2024-01-02 00:00:00'
         WHERE user_id = 5`
      ),
      env.DB.prepare(
        "INSERT INTO users (user_id, user_name) VALUES (9200, '0033担任確認')"
      ),
      env.DB.prepare(
        `INSERT INTO teachers (teacher_id, user_id, email)
         VALUES (9200, 9200, '0033-teacher@example.com')`
      ),
      env.DB.prepare(
        'UPDATE class_rooms SET teacher_id = 9200 WHERE class_room_id = 2'
      ),
      env.DB.prepare(
        "UPDATE class_rooms SET class_name = '2年Aクラス（更新）' WHERE class_room_id = 3"
      ),
    ]);

    await runMigration();

    expect(await getSeedCounts()).toEqual([2, 5, 4, 3]);
    const remainingEvents = await env.DB.prepare(
      'SELECT event_id FROM events WHERE event_id BETWEEN 1 AND 4 ORDER BY event_id'
    ).all<{ event_id: number }>();
    expect(remainingEvents.results).toEqual([{ event_id: 1 }, { event_id: 2 }]);
    await expectForeignKeysToBeValid();
  });

  it('各DELETEの途中から再実行しても同じ削除結果へ収束する', async () => {
    expect(migrationQueries).toHaveLength(4);
    const partialCounts = [
      [0, 5, 4, 3],
      [0, 5, 0, 3],
      [0, 0, 0, 3],
    ];

    for (const [index, expectedCounts] of partialCounts.entries()) {
      await resetDatabase();
      await insertExactSeeds();

      await runMigration(index + 1);

      expect(await getSeedCounts()).toEqual(expectedCounts);
      await expectForeignKeysToBeValid();

      await runMigration();
      await runMigration();

      expect(await getSeedCounts()).toEqual([0, 0, 0, 0]);
      await expectForeignKeysToBeValid();
    }
  });

  it('削除後も採番済みのIDを再利用しない', async () => {
    await insertExactSeeds();
    await runMigration();

    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('0033採番確認') RETURNING user_id"
    ).first<{ user_id: number }>();
    const classRoom = await env.DB.prepare(
      `INSERT INTO class_rooms (class_code, class_name)
       VALUES ('99Z', '0033採番確認') RETURNING class_room_id`
    ).first<{ class_room_id: number }>();
    const event = await env.DB.prepare(
      `INSERT INTO events (event_name, venue, start_time, end_time)
       VALUES ('0033採番確認', '体育館', '0900', '1000')
       RETURNING event_id`
    ).first<{ event_id: number }>();
    const student = await env.DB.prepare(
      `INSERT INTO students (
        user_id, class_room_id, attendance_number, student_id_number
      ) VALUES (?, ?, 1, '0033-sequence') RETURNING student_id`
    )
      .bind(user?.user_id, classRoom?.class_room_id)
      .first<{ student_id: number }>();

    expect(user?.user_id).toBeGreaterThan(5);
    expect(classRoom?.class_room_id).toBeGreaterThan(3);
    expect(event?.event_id).toBeGreaterThan(4);
    expect(student?.student_id).toBeGreaterThan(4);
    await expectForeignKeysToBeValid();
  });
});
