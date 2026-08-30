import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0028_create_team_teamscore_update_class.sql'
  );
  if (!migration) {
    throw new Error(
      '0028_create_team_teamscore_update_class.sql is not registered'
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
    env.DB.prepare('DROP INDEX IF EXISTS uq_team_scores_event_team'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_team_scores_team_id'),
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
    env.DB.prepare('DROP INDEX IF EXISTS uq_team_scores_event_team'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_team_scores_team_id'),
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
    env.DB.prepare(
      'CREATE UNIQUE INDEX uq_team_scores_event_team ON team_scores(event_id, team_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_team_scores_team_id ON team_scores(team_id)'
    ),
  ]);
}

async function runMigration() {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

describe('0028_create_team_teamscore_update_class.sql', () => {
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
        expect.objectContaining({ name: 'event_id', notnull: 1 }),
        expect.objectContaining({ name: 'team_id', notnull: 1 }),
        expect.objectContaining({ name: 'scores', notnull: 1 }),
      ])
    );

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
});
