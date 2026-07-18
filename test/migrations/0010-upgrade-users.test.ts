import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// migrations/0010_upgrade_users.sql の「データ変換」部分だけを検証するテスト。
//
// 0010 自体は既にDBに一度だけ適用済みで、旧テーブル(m_class_rooms/m_users/
// m_student_description)は既に削除され、新テーブル(users/class_rooms/students)は
// 既に存在する。そのため 0010 をそのまま再実行することはできない
// （CREATE TABLE が重複エラーになる、ALTER TABLE RENAME 対象の users が存在しない等）。
//
// ここでは「旧テーブルを一時的に作り直し→本番と同一のデータ変換SQLを実行→
// 結果を検証→旧テーブルを削除」というサイクルを1テストごとに行うことで、
// 実運用データに対する変換ロジック（孤立ガード・__UNASSIGNED__フォールバック含む）
// を検証する。テスト対象のIDは他ファイルのfixtureと衝突しないよう
// 900000番台の明示的なIDを使う。
//
// D1 の db.exec() は単純に改行区切りで文を分割するため、複数行にまたがる
// CREATE TABLE/INSERT...SELECT はそのままでは実行できない
// （D1_EXEC_ERROR: incomplete input）。実際の migrations 適用は
// db.batch() 相当の仕組みで行われている（各文が独立して解釈され、
// かつ全体がアトミックに実行される）ため、ここでも db.batch() で
// 個々の文に分けて実行する。
//
// 重要: 各 SQL 文は migrations/0010_upgrade_users.sql の
// 「INSERT INTO users ... 以降、DROP TABLE より前」の内容と同一(改行のみ除去)
// に保つこと。0010 の該当箇所を変更した場合はこちらも合わせて更新する。
const TRANSFORM_STATEMENTS = [
  `INSERT INTO users (user_id, user_name, is_live_active) SELECT f_users_id, f_display_name, 1 FROM m_users`,
  `INSERT INTO class_rooms (class_room_id, class_code, class_name, created_at, updated_at) SELECT f_class_room_id, f_class_code, f_name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM m_class_rooms`,
  `INSERT INTO class_rooms (class_code, class_name) SELECT '__UNASSIGNED__', '未割当' WHERE EXISTS (SELECT 1 FROM m_student_description sd INNER JOIN m_users m ON sd.f_users_id = m.f_users_id WHERE m.f_class_room_id IS NULL)`,
  `CREATE TABLE __migration_guard (orphan_count INTEGER CHECK (orphan_count = 0))`,
  `INSERT INTO __migration_guard (orphan_count) SELECT COUNT(*) FROM m_student_description sd LEFT JOIN m_users m ON sd.f_users_id = m.f_users_id WHERE m.f_users_id IS NULL`,
  `DROP TABLE IF EXISTS __migration_guard`,
  `INSERT INTO students (student_id, user_id, class_room_id, attendance_number, student_id_number, created_at, updated_at) SELECT sd.f_student_id, m.f_users_id, COALESCE(m.f_class_room_id, (SELECT class_room_id FROM class_rooms WHERE class_code = '__UNASSIGNED__')), sd.f_attendance_number, sd.f_student_id_number, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM m_student_description sd INNER JOIN m_users m ON sd.f_users_id = m.f_users_id`,
];

async function runTransform() {
  await env.DB.batch(
    TRANSFORM_STATEMENTS.map(sql => env.DB.prepare(sql))
  );
}

async function createLegacySchema() {
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE m_class_rooms (f_class_room_id INTEGER PRIMARY KEY, f_class_code TEXT NOT NULL, f_name TEXT NOT NULL)'
    ),
    env.DB.prepare(
      'CREATE TABLE m_users (f_users_id INTEGER PRIMARY KEY, f_class_room_id INTEGER, f_display_name TEXT NOT NULL, f_uid TEXT NOT NULL, FOREIGN KEY (f_class_room_id) REFERENCES m_class_rooms(f_class_room_id))'
    ),
    env.DB.prepare(
      'CREATE TABLE m_student_description (f_student_id INTEGER PRIMARY KEY, f_users_id INTEGER NOT NULL, f_attendance_number INTEGER NOT NULL, f_student_id_number TEXT NOT NULL UNIQUE, FOREIGN KEY (f_users_id) REFERENCES m_users(f_users_id))'
    ),
  ]);
}

// 孤立ガードのテスト専用: 本来 m_student_description.f_users_id には
// m_users を参照する FOREIGN KEY があり、通常の INSERT ではこの制約が
// 孤立行の作成自体を防ぐ（実際に試すと FOREIGN KEY constraint failed になる、
// かつ D1 では PRAGMA foreign_keys = OFF による無効化も効かない）。
// そのため孤立データは「FK制約が導入される前に何らかの理由で紛れ込んだ
// 既存の不整合データ」を模したものとして、あえて FK 無しのスキーマ変種で
// 再現する。ガード自体はこの種の“FKをすり抜けた”不整合を検知するために存在する。
async function createLegacySchemaWithoutForeignKey() {
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE m_class_rooms (f_class_room_id INTEGER PRIMARY KEY, f_class_code TEXT NOT NULL, f_name TEXT NOT NULL)'
    ),
    env.DB.prepare(
      'CREATE TABLE m_users (f_users_id INTEGER PRIMARY KEY, f_class_room_id INTEGER, f_display_name TEXT NOT NULL, f_uid TEXT NOT NULL)'
    ),
    env.DB.prepare(
      'CREATE TABLE m_student_description (f_student_id INTEGER PRIMARY KEY, f_users_id INTEGER NOT NULL, f_attendance_number INTEGER NOT NULL, f_student_id_number TEXT NOT NULL UNIQUE)'
    ),
  ]);
}

async function dropLegacySchema() {
  await env.DB.prepare('DROP TABLE IF EXISTS m_student_description').run();
  await env.DB.prepare('DROP TABLE IF EXISTS m_users').run();
  await env.DB.prepare('DROP TABLE IF EXISTS m_class_rooms').run();
}

async function cleanupMigratedRows(ids: {
  classRoomIds: number[];
  userIds: number[];
  studentIds: number[];
}) {
  for (const id of ids.studentIds) {
    await env.DB.prepare('DELETE FROM students WHERE student_id = ?')
      .bind(id)
      .run();
  }
  for (const id of ids.userIds) {
    await env.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(id).run();
  }
  for (const id of ids.classRoomIds) {
    await env.DB.prepare('DELETE FROM class_rooms WHERE class_room_id = ?')
      .bind(id)
      .run();
  }
  await env.DB.prepare(
    "DELETE FROM class_rooms WHERE class_code = '__UNASSIGNED__'"
  ).run();
}

describe('0010_upgrade_users.sql のデータ変換ロジック', () => {
  afterEach(async () => {
    await dropLegacySchema();
  });

  it('通常の生徒・教室未割当の生徒・descriptionを持たない教師を正しく変換する', async () => {
    await createLegacySchema();
    const ROOM_A = 900001;
    const ROOM_B = 900002;
    const TEACHER = 900101;
    const STUDENT_ASSIGNED = 900102;
    const STUDENT_UNASSIGNED = 900103;
    const DESC_ASSIGNED = 900201;
    const DESC_UNASSIGNED = 900202;

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO m_class_rooms (f_class_room_id, f_class_code, f_name) VALUES (?, ?, ?), (?, ?, ?)'
      ).bind(ROOM_A, '90A', 'テスト90A組', ROOM_B, '90B', 'テスト90B組'),
      env.DB.prepare(
        'INSERT INTO m_users (f_users_id, f_class_room_id, f_display_name, f_uid) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, NULL, ?, ?)'
      ).bind(
        TEACHER,
        ROOM_A,
        '移行先生',
        'uid-teacher-900',
        STUDENT_ASSIGNED,
        ROOM_A,
        '移行太郎',
        'uid-student-900-a',
        STUDENT_UNASSIGNED,
        '移行花子',
        'uid-student-900-b'
      ),
      env.DB.prepare(
        'INSERT INTO m_student_description (f_student_id, f_users_id, f_attendance_number, f_student_id_number) VALUES (?, ?, ?, ?), (?, ?, ?, ?)'
      ).bind(
        DESC_ASSIGNED,
        STUDENT_ASSIGNED,
        1,
        'MIG-90000-A',
        DESC_UNASSIGNED,
        STUDENT_UNASSIGNED,
        2,
        'MIG-90000-B'
      ),
    ]);

    try {
      await runTransform();

      const users = await env.DB.prepare(
        'SELECT user_id, user_name FROM users WHERE user_id IN (?, ?, ?) ORDER BY user_id'
      )
        .bind(TEACHER, STUDENT_ASSIGNED, STUDENT_UNASSIGNED)
        .all();
      expect(users.results).toEqual([
        { user_id: TEACHER, user_name: '移行先生' },
        { user_id: STUDENT_ASSIGNED, user_name: '移行太郎' },
        { user_id: STUDENT_UNASSIGNED, user_name: '移行花子' },
      ]);

      const rooms = await env.DB.prepare(
        'SELECT class_room_id, class_code, class_name FROM class_rooms WHERE class_room_id IN (?, ?) ORDER BY class_room_id'
      )
        .bind(ROOM_A, ROOM_B)
        .all();
      expect(rooms.results).toEqual([
        { class_room_id: ROOM_A, class_code: '90A', class_name: 'テスト90A組' },
        { class_room_id: ROOM_B, class_code: '90B', class_name: 'テスト90B組' },
      ]);

      const unassignedRoom = await env.DB.prepare(
        "SELECT class_room_id FROM class_rooms WHERE class_code = '__UNASSIGNED__'"
      ).first<{ class_room_id: number }>();
      expect(unassignedRoom).not.toBeNull();

      const students = await env.DB.prepare(
        'SELECT student_id, user_id, class_room_id, attendance_number, student_id_number FROM students WHERE student_id IN (?, ?) ORDER BY student_id'
      )
        .bind(DESC_ASSIGNED, DESC_UNASSIGNED)
        .all();
      expect(students.results).toEqual([
        {
          student_id: DESC_ASSIGNED,
          user_id: STUDENT_ASSIGNED,
          class_room_id: ROOM_A,
          attendance_number: 1,
          student_id_number: 'MIG-90000-A',
        },
        {
          student_id: DESC_UNASSIGNED,
          user_id: STUDENT_UNASSIGNED,
          class_room_id: unassignedRoom?.class_room_id,
          attendance_number: 2,
          student_id_number: 'MIG-90000-B',
        },
      ]);

      // 教師は m_student_description を持たないため students には現れない
      const teacherAsStudent = await env.DB.prepare(
        'SELECT student_id FROM students WHERE user_id = ?'
      )
        .bind(TEACHER)
        .first();
      expect(teacherAsStudent).toBeNull();
    } finally {
      await cleanupMigratedRows({
        classRoomIds: [ROOM_A, ROOM_B],
        userIds: [TEACHER, STUDENT_ASSIGNED, STUDENT_UNASSIGNED],
        studentIds: [DESC_ASSIGNED, DESC_UNASSIGNED],
      });
    }
  });

  it('孤立した description (対応する m_users が無い) がある場合、CHECK制約違反で変換全体を中断しロールバックする', async () => {
    await createLegacySchemaWithoutForeignKey();
    const ORPHAN_USER = 910101; // description からのみ参照され、m_users には存在しない
    const VALID_USER = 910102;
    const DESC_ORPHAN = 910201;
    const DESC_VALID = 910202;

    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO m_users (f_users_id, f_class_room_id, f_display_name, f_uid) VALUES (?, NULL, ?, ?)'
      ).bind(VALID_USER, '移行次郎', 'uid-student-910'),
      env.DB.prepare(
        'INSERT INTO m_student_description (f_student_id, f_users_id, f_attendance_number, f_student_id_number) VALUES (?, ?, ?, ?), (?, ?, ?, ?)'
      ).bind(
        DESC_VALID,
        VALID_USER,
        1,
        'MIG-91000-VALID',
        DESC_ORPHAN,
        ORPHAN_USER,
        2,
        'MIG-91000-ORPHAN'
      ),
    ]);

    await expect(runTransform()).rejects.toThrow('CHECK constraint failed');

    // db.batch() はアトミックに実行されるため、CHECK制約違反より前に実行された
    // users への INSERT も含めて全てロールバックされているはずである
    const migratedUser = await env.DB.prepare(
      'SELECT user_id FROM users WHERE user_id = ?'
    )
      .bind(VALID_USER)
      .first();
    expect(migratedUser).toBeNull();

    const migratedStudent = await env.DB.prepare(
      'SELECT student_id FROM students WHERE student_id IN (?, ?)'
    )
      .bind(DESC_VALID, DESC_ORPHAN)
      .all();
    expect(migratedStudent.results).toHaveLength(0);

    await cleanupMigratedRows({
      classRoomIds: [],
      userIds: [VALID_USER, ORPHAN_USER],
      studentIds: [DESC_VALID, DESC_ORPHAN],
    });
  });

  it('auth_users が既に存在する場合、冒頭の冪等性ガードでCHECK制約違反となり中断する', async () => {
    // #78 で auth_users は廃止されるため、旧テーブルをテスト内だけ復元して
    // 0010 冒頭の冪等性ガードを検証する。
    await env.DB.prepare('CREATE TABLE auth_users (id INTEGER PRIMARY KEY)').run();
    try {
      await expect(
        env.DB.batch([
          env.DB.prepare(
            'CREATE TABLE __migration_0010_guard (already_applied INTEGER CHECK (already_applied = 0))'
          ),
          env.DB.prepare(
            "INSERT INTO __migration_0010_guard (already_applied) SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'auth_users'"
          ),
        ])
      ).rejects.toThrow('CHECK constraint failed');
    } finally {
      await env.DB.prepare('DROP TABLE IF EXISTS __migration_0010_guard').run();
      await env.DB.prepare('DROP TABLE auth_users').run();
    }
  });
});
