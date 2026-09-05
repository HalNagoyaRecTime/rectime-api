import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import {
  class_rooms,
  students as studentsTable,
  users,
} from '../../src/infrastructure/database/schema';
import { insertClassRoomWithTeam } from './classRooms';

// テスト専用の学生データ。マイグレーションのシードには依存しない。
const STUDENTS = [
  {
    displayName: '田中太郎',
    attendanceNumber: 1,
    studentIdNumber: '10000',
  },
  {
    displayName: '佐藤花子',
    attendanceNumber: 2,
    studentIdNumber: '10001',
  },
  {
    displayName: '鈴木一郎',
    attendanceNumber: 3,
    studentIdNumber: '10002',
  },
  {
    displayName: '高橋次郎',
    attendanceNumber: 4,
    studentIdNumber: '10003',
  },
] as const;

export type SeededStudent = {
  studentId: number;
  userId: number;
  classRoomId: number;
  displayName: string;
  attendanceNumber: number;
  studentIdNumber: string;
};

export type SeededData = {
  classRoomId: number;
  students: SeededStudent[];
  // students を持たないユーザー（findAll で除外されることの検証用）
  teacher: { userId: number; displayName: string };
};

// テスト用の学生データを返す関数。
export async function seedStudents(db: D1Database): Promise<SeededData> {
  const orm = drizzle(db, { schema });

  await db.prepare('DELETE FROM gathering_group_members').run();
  await db.prepare('DELETE FROM notification_schedules').run();
  await db.prepare('DELETE FROM gatherings').run();
  await db.prepare('DELETE FROM events').run();
  await orm.delete(studentsTable);
  await orm.delete(users);
  await orm.delete(class_rooms);
  await db.prepare('DELETE FROM team_scores').run();
  await db.prepare('DELETE FROM teams').run();

  const now = new Date().toISOString();
  const { classRoomId } = await insertClassRoomWithTeam(db, {
    classCode: 'TEST-1',
    className: 'テスト教室',
  });

  const seededStudents: SeededStudent[] = [];
  for (const s of STUDENTS) {
    const [user] = await orm
      .insert(users)
      .values({
        userName: s.displayName,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [student] = await orm
      .insert(studentsTable)
      .values({
        userId: user.id,
        classRoomId,
        attendanceNumber: s.attendanceNumber,
        studentIdNumber: s.studentIdNumber,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    seededStudents.push({
      studentId: student.id,
      userId: user.id,
      classRoomId,
      displayName: s.displayName,
      attendanceNumber: s.attendanceNumber,
      studentIdNumber: s.studentIdNumber,
    });
  }

  // students を持たないユーザーを1名追加（findAll の inner join で除外される）
  const [teacher] = await orm
    .insert(users)
    .values({
      userName: '山田先生',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    classRoomId,
    students: seededStudents,
    teacher: { userId: teacher.id, displayName: teacher.userName },
  };
}
