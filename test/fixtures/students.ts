import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import {
  class_rooms,
  users,
  student_description,
} from '../../src/infrastructure/database/schema';

// テスト専用の学生データ。マイグレーションのシードには依存しない。
const STUDENTS = [
  {
    userName: '田中太郎',
    uid: '0000-0000',
    attendanceNumber: 1,
    studentIdNumber: '10000',
  },
  {
    userName: '佐藤花子',
    uid: '0000-0001',
    attendanceNumber: 2,
    studentIdNumber: '10001',
  },
  {
    userName: '鈴木一郎',
    uid: '0000-0002',
    attendanceNumber: 3,
    studentIdNumber: '10002',
  },
  {
    userName: '高橋次郎',
    uid: '0000-0003',
    attendanceNumber: 4,
    studentIdNumber: '10003',
  },
] as const;

export type SeededStudent = {
  studentId: number;
  usersId: number;
  classRoomId: number;
  userName: string;
  uid: string;
  attendanceNumber: number;
  studentIdNumber: string;
};

export type SeededData = {
  classRoomId: number;
  classCode: string;
  students: SeededStudent[];
  // m_studet_description を持たない先生（findAll で除外されることの検証用）
  teacher: { usersId: number; userName: string };
};

// テスト用の学生データを返す関数。
export async function seedStudents(db: D1Database): Promise<SeededData> {
  const orm = drizzle(db, { schema });

  // すでに存在するレコードを全て削除する。
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
        userName: s.userName,
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
      userName: s.userName,
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
      userName: '山田先生',
      uid: '0000-0004',
    })
    .returning();

  return {
    classRoomId: classRoom.id,
    classCode: classRoom.classCode,
    students,
    teacher: { usersId: teacher.id, userName: teacher.userName },
  };
}
