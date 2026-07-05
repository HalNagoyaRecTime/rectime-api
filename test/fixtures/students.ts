import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import {
  class_rooms,
  users_old as users,
  student_description,
} from '../../src/infrastructure/database/schema';
// PRAGMA を直接実行するため D1 の prepare を使う
// テスト専用の学生データ。マイグレーションのシードには依存しない。
const STUDENTS = [
  {
    displayName: '田中太郎',
    uid: '0000-0000',
    attendanceNumber: 1,
    studentIdNumber: '10000',
  },
  {
    displayName: '佐藤花子',
    uid: '0000-0001',
    attendanceNumber: 2,
    studentIdNumber: '10001',
  },
  {
    displayName: '鈴木一郎',
    uid: '0000-0002',
    attendanceNumber: 3,
    studentIdNumber: '10002',
  },
  {
    displayName: '高橋次郎',
    uid: '0000-0003',
    attendanceNumber: 4,
    studentIdNumber: '10003',
  },
] as const;

export type SeededStudent = {
  studentId: number;
  usersId: number;
  classRoomId: number;
  displayName: string;
  uid: string;
  attendanceNumber: number;
  studentIdNumber: string;
};

export type SeededData = {
  classRoomId: number;
  students: SeededStudent[];
  // m_studet_description を持たない先生（findAll で除外されることの検証用）
  teacher: { usersId: number; displayName: string };
};

// テスト用の学生データを返す関数。
export async function seedStudents(db: D1Database): Promise<SeededData> {
  const orm = drizzle(db, { schema });

  await db.prepare('PRAGMA foreign_keys = OFF').run();

  // 古い/既存テーブルの削除（存在する場合）
  const hasStudentDesc = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='m_student_description'"
    )
    .first();
  if (hasStudentDesc) {
    await db.prepare('DROP TABLE IF EXISTS m_student_description').run();
  }

  // 他テーブルが `users` を参照していると FK エラーになるので先に削除
  await db.prepare('DROP TABLE IF EXISTS microsoft_account_links').run();
  await db.prepare('DROP TABLE IF EXISTS firebase_tokens').run();

  // 新スキーマ側の users テーブルを確認して削除
  const hasUsers = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    )
    .first();
  if (hasUsers) {
    await db.prepare('DROP TABLE IF EXISTS users').run();
  }

  // class_rooms テーブルが存在することを確認（外部キーの問題を避けたいから削除しないで）。
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS m_class_rooms (
    f_class_room_id INTEGER PRIMARY KEY AUTOINCREMENT,
    f_class_code TEXT NOT NULL,
    f_name TEXT NOT NULL
  )`
    )
    .run();

  await db.prepare('PRAGMA foreign_keys = ON').run();

  const [classRoom] = await orm
    .insert(class_rooms)
    .values({ classCode: 'TEST-1', name: 'テスト教室' })
    .returning();

  // テスト実行環境で新しい `users` / `m_student_description` が存在しない場合は簡易的に作成しておく
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS users_old (
    f_users_id INTEGER PRIMARY KEY AUTOINCREMENT,
    f_class_room_id INTEGER,
    f_display_name TEXT NOT NULL,
    f_uid TEXT NOT NULL
  )`
    )
    .run();

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS m_student_description (
    f_student_id INTEGER PRIMARY KEY AUTOINCREMENT,
    f_users_id INTEGER NOT NULL,
    f_attendance_number INTEGER NOT NULL,
    f_student_id_number TEXT NOT NULL UNIQUE
  )`
    )
    .run();

  const students: SeededStudent[] = [];
  for (const s of STUDENTS) {
    const [user] = await orm
      .insert(users as any)
      .values({
        classRoomId: classRoom.id,
        displayName: s.displayName,
        uid: s.uid,
      })
      .returning();

    const [desc] = await orm
      .insert(student_description)
      .values({
        usersId: user.id,
        attendanceNumber: s.attendanceNumber,
        studentIdNumber: s.studentIdNumber,
      })
      .returning();

    students.push({
      studentId: desc.id,
      usersId: user.id,
      classRoomId: classRoom.id,
      displayName: s.displayName,
      uid: s.uid,
      attendanceNumber: s.attendanceNumber,
      studentIdNumber: s.studentIdNumber,
    });
  }

  // description を持たない先生を1名追加（findAll の inner join で除外される）
  const [teacher] = await orm
    .insert(users as any)
    .values({
      classRoomId: classRoom.id,
      displayName: '山田先生',
      uid: '0000-0004',
    })
    .returning();

  return {
    classRoomId: classRoom.id,
    students,
    teacher: { usersId: teacher.id, displayName: teacher.displayName },
  };
}
