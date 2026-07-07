import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import {
  class_rooms,
  entries,
  firebase_tokens,
  notification_send_logs,
  notification_users,
  users,
  student_description,
} from '../../src/infrastructure/database/schema';

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

  // 外部キーの参照元から削除する。
  await orm.delete(notification_send_logs);
  await orm.delete(entries);
  await orm.delete(firebase_tokens);
  await orm.delete(notification_users);
  await orm.delete(student_description);
  await orm.delete(users);
  await orm.delete(class_rooms);

  const [classRoom] = await orm
    .insert(class_rooms)
    .values({ classCode: 'TEST-1', name: 'テスト教室' })
    .returning();

  const students: SeededStudent[] = [];
  for (const s of STUDENTS) {
    const [user] = await orm
      .insert(users)
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
    .insert(users)
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
