import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0030_create_team_teamscore_update_class.sql'
  );
  if (!migration) {
    throw new Error(
      '0030_create_team_teamscore_update_class.sql is not registered'
    );
  }
  return migration.queries;
})();

// class_rooms.team_id は teams(team_id) を、students.class_room_id は
// class_rooms(class_room_id) をそれぞれNOT NULLの外部キーで参照しているため、
// DROP TABLEすると参照元の行に対して暗黙DELETEが走りFK違反になる。
// 実データを保持したままriderename退避し、空の受け皿テーブルを同名で作り直す。
async function prepareLegacySchema() {
  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS idx_class_rooms_team_id'),
    env.DB.prepare('DROP INDEX IF EXISTS uq_class_rooms_class_code'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_class_rooms_teacher_id'),
    env.DB.prepare('DROP INDEX IF EXISTS uq_teams_team_name'),
    env.DB.prepare('ALTER TABLE students RENAME TO students_backup'),
    env.DB.prepare('ALTER TABLE class_rooms RENAME TO class_rooms_backup'),
    env.DB.prepare('ALTER TABLE team_scores RENAME TO team_scores_backup'),
    env.DB.prepare('ALTER TABLE teams RENAME TO teams_backup'),
    env.DB.prepare(
      `CREATE TABLE class_rooms (
        class_room_id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_code TEXT NOT NULL,
        class_name TEXT NOT NULL,
        teacher_id INTEGER REFERENCES teachers(teacher_id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE students (
        student_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        class_room_id INTEGER NOT NULL,
        attendance_number INTEGER NOT NULL,
        student_id_number TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        FOREIGN KEY (class_room_id) REFERENCES class_rooms(class_room_id),
        UNIQUE (user_id)
      )`
    ),
  ]);
}

async function restoreCurrentSchema() {
  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS uq_teams_team_name'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_class_rooms_team_id'),
    env.DB.prepare('DROP INDEX IF EXISTS uq_class_rooms_class_code'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_class_rooms_teacher_id'),
    env.DB.prepare('DROP TABLE IF EXISTS students_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS students'),
    env.DB.prepare('DROP TABLE IF EXISTS class_rooms_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS class_rooms'),
    env.DB.prepare('DROP TABLE IF EXISTS team_scores'),
    env.DB.prepare('DROP TABLE IF EXISTS teams'),
    env.DB.prepare('ALTER TABLE students_backup RENAME TO students'),
    env.DB.prepare('ALTER TABLE class_rooms_backup RENAME TO class_rooms'),
    env.DB.prepare('ALTER TABLE team_scores_backup RENAME TO team_scores'),
    env.DB.prepare('ALTER TABLE teams_backup RENAME TO teams'),
    env.DB.prepare(
      'CREATE UNIQUE INDEX uq_class_rooms_class_code ON class_rooms(class_code)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_class_rooms_teacher_id ON class_rooms(teacher_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_class_rooms_team_id ON class_rooms(team_id)'
    ),
    env.DB.prepare('CREATE UNIQUE INDEX uq_teams_team_name ON teams(team_name)'),
  ]);
}

async function runMigration() {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

describe('0030_create_team_teamscore_update_class.sql', () => {
  afterEach(async () => {
    await restoreCurrentSchema();
  });

  it('既存のclass_roomsをteamsへ引き継ぎ、class_rooms.team_idで対応付ける', async () => {
    await prepareLegacySchema();
    const ROOM_A = 900301;
    const ROOM_B = 900302;
    await env.DB.prepare(
      'INSERT INTO class_rooms (class_room_id, class_code, class_name) VALUES (?, ?, ?), (?, ?, ?)'
    )
      .bind(ROOM_A, '90C', 'テスト90C組', ROOM_B, '90D', 'テスト90D組')
      .run();

    await runMigration();

    const rooms = await env.DB.prepare(
      `SELECT c.class_room_id, c.class_code, c.class_name, t.team_name
       FROM class_rooms c
       JOIN teams t ON t.team_id = c.team_id
       WHERE c.class_room_id IN (?, ?)
       ORDER BY c.class_room_id`
    )
      .bind(ROOM_A, ROOM_B)
      .all();
    expect(rooms.results).toEqual([
      {
        class_room_id: ROOM_A,
        class_code: '90C',
        class_name: 'テスト90C組',
        team_name: 'テスト90C組(90C)',
      },
      {
        class_room_id: ROOM_B,
        class_code: '90D',
        class_name: 'テスト90D組',
        team_name: 'テスト90D組(90D)',
      },
    ]);

    const columns = await env.DB.prepare('PRAGMA table_info(class_rooms)').all<{
      name: string;
      notnull: number;
    }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'team_id', notnull: 1 }),
        expect.objectContaining({ name: 'teacher_id', notnull: 0 }),
      ])
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(class_rooms)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'teams',
          from: 'team_id',
          to: 'team_id',
        }),
        expect.objectContaining({
          table: 'teachers',
          from: 'teacher_id',
          to: 'teacher_id',
        }),
      ])
    );

    const indexes = await env.DB.prepare('PRAGMA index_list(class_rooms)').all<{
      name: string;
    }>();
    expect(indexes.results.map(index => index.name)).toEqual(
      expect.arrayContaining([
        'uq_class_rooms_class_code',
        'idx_class_rooms_teacher_id',
        'idx_class_rooms_team_id',
      ])
    );

    const teamScoreColumns = await env.DB.prepare(
      'PRAGMA table_info(team_scores)'
    ).all<{ name: string; notnull: number }>();
    expect(teamScoreColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'team_id', notnull: 1 }),
        expect.objectContaining({ name: 'scores', notnull: 1 }),
      ])
    );
    expect(teamScoreColumns.results.map(column => column.name)).not.toContain(
      'event_id'
    );

    // team_scoresの行は得点入力時に初めて作る想定で、移行では作らない。
    // ここで全teamsに0点の行を作ってしまうと、class_roomsの後片付け条件
    // (NOT EXISTS team_scores)が本番では常に不成立になり、参照の無い
    // 単独編成が二度と消せなくなる。
    const teamScores = await env.DB.prepare(
      `SELECT ts.team_id
       FROM team_scores ts
       JOIN teams t ON t.team_id = ts.team_id
       WHERE t.team_id IN (?, ?)`
    )
      .bind(ROOM_A, ROOM_B)
      .all();
    expect(teamScores.results).toEqual([]);

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });

  it('team_idを指定しないclass_roomsの追加はNOT NULL制約で拒否される', async () => {
    await prepareLegacySchema();
    await env.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('90E', 'テスト90E組')"
    ).run();

    await runMigration();

    await expect(
      env.DB.prepare(
        "INSERT INTO class_rooms (class_code, class_name) VALUES ('90F', 'テスト90F組')"
      ).run()
    ).rejects.toThrow('NOT NULL constraint failed');
  });

  it('移行後もclass_room_idのAUTOINCREMENT採番が既存の最大値から継続する', async () => {
    await prepareLegacySchema();
    const ROOM = 900303;
    await env.DB.prepare(
      "INSERT INTO class_rooms (class_room_id, class_code, class_name) VALUES (?, '90G', 'テスト90G組')"
    )
      .bind(ROOM)
      .run();

    await runMigration();

    const team = await env.DB.prepare(
      'SELECT team_id FROM teams WHERE team_name = ?'
    )
      .bind('テスト90G組(90G)')
      .first<{ team_id: number }>();
    const next = await env.DB.prepare(
      'INSERT INTO class_rooms (class_code, class_name, team_id) VALUES (?, ?, ?) RETURNING class_room_id'
    )
      .bind('90H', 'テスト90H組', team!.team_id)
      .first<{ class_room_id: number }>();
    expect(next!.class_room_id).toBeGreaterThan(ROOM);
  });

  it('クラス名が重複していても移行できる', async () => {
    await prepareLegacySchema();
    await env.DB.prepare(
      'INSERT INTO class_rooms (class_room_id, class_code, class_name) VALUES (?, ?, ?), (?, ?, ?)'
    )
      .bind(900401, '90X', 'テスト90組', 900402, '90Y', 'テスト90組')
      .run();

    await expect(runMigration()).resolves.not.toThrow();

    const teams = await env.DB.prepare(
      'SELECT team_id FROM teams WHERE team_id IN (?, ?)'
    )
      .bind(900401, 900402)
      .all();
    expect(teams.results).toHaveLength(2);
  });

  it('学生データは移行後も内容と所属が保たれる', async () => {
    await prepareLegacySchema();
    const ROOM = 900501;
    await env.DB.prepare(
      'INSERT INTO class_rooms (class_room_id, class_code, class_name) VALUES (?, ?, ?)'
    )
      .bind(ROOM, '90I', 'テスト90I組')
      .run();

    const USER = 900601;
    const STUDENT = 900701;
    await env.DB.prepare('INSERT INTO users (user_id, user_name) VALUES (?, ?)')
      .bind(USER, 'テスト太郎')
      .run();
    await env.DB.prepare(
      `INSERT INTO students
         (student_id, user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(STUDENT, USER, ROOM, 7, 'S900701')
      .run();

    await runMigration();

    const student = await env.DB.prepare(
      'SELECT * FROM students WHERE student_id = ?'
    )
      .bind(STUDENT)
      .first();
    expect(student).toMatchObject({
      user_id: USER,
      class_room_id: ROOM,
      attendance_number: 7,
      student_id_number: 'S900701',
    });

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(students)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'class_rooms',
          from: 'class_room_id',
          to: 'class_room_id',
        }),
      ])
    );

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });

  it('同じクラスに複数の学生がいても全員移行される', async () => {
    await prepareLegacySchema();
    const ROOM = 900502;
    await env.DB.prepare(
      'INSERT INTO class_rooms (class_room_id, class_code, class_name) VALUES (?, ?, ?)'
    )
      .bind(ROOM, '90J', 'テスト90J組')
      .run();

    const USER_A = 900602;
    const USER_B = 900603;
    const STUDENT_A = 900702;
    const STUDENT_B = 900703;
    await env.DB.prepare(
      'INSERT INTO users (user_id, user_name) VALUES (?, ?), (?, ?)'
    )
      .bind(USER_A, 'テスト花子', USER_B, 'テスト次郎')
      .run();
    await env.DB.prepare(
      `INSERT INTO students
         (student_id, user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`
    )
      .bind(
        STUDENT_A,
        USER_A,
        ROOM,
        1,
        'S900702',
        STUDENT_B,
        USER_B,
        ROOM,
        2,
        'S900703'
      )
      .run();

    await runMigration();

    const students = await env.DB.prepare(
      'SELECT student_id FROM students WHERE class_room_id = ? ORDER BY student_id'
    )
      .bind(ROOM)
      .all<{ student_id: number }>();
    expect(students.results.map(row => row.student_id)).toEqual([
      STUDENT_A,
      STUDENT_B,
    ]);
  });

  it('移行後もstudent_idのAUTOINCREMENT採番が既存の最大値から継続する', async () => {
    await prepareLegacySchema();
    const ROOM = 900503;
    const USER = 900604;
    const STUDENT = 900704;
    await env.DB.prepare(
      'INSERT INTO class_rooms (class_room_id, class_code, class_name) VALUES (?, ?, ?)'
    )
      .bind(ROOM, '90K', 'テスト90K組')
      .run();
    await env.DB.prepare('INSERT INTO users (user_id, user_name) VALUES (?, ?)')
      .bind(USER, 'テスト三郎')
      .run();
    await env.DB.prepare(
      `INSERT INTO students
         (student_id, user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(STUDENT, USER, ROOM, 1, 'S900704')
      .run();

    await runMigration();

    const nextUser = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('テスト四郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    const next = await env.DB.prepare(
      `INSERT INTO students
         (user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, ?, ?) RETURNING student_id`
    )
      .bind(nextUser!.user_id, ROOM, 2, 'S900705')
      .first<{ student_id: number }>();
    expect(next!.student_id).toBeGreaterThan(STUDENT);
  });
});
