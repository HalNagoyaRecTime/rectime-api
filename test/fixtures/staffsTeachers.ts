import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import {
  class_rooms,
  staffs as staffsTable,
  teachers as teachersTable,
  students as studentsTable,
  users,
} from '../../src/infrastructure/database/schema';
import { insertClassRoomWithTeam } from './classRooms';

// テスト専用の職員・教員データ。マイグレーションのシードには依存しない。
const STAFFS = [
  { displayName: '佐々木職員' },
  { displayName: '伊藤職員' },
] as const;

const TEACHERS = [
  { displayName: '山田先生' },
  { displayName: '中村先生' },
] as const;

const CLASS_ROOMS = [
  { classCode: 'TEST-1', name: 'テスト1組' },
  { classCode: 'TEST-2', name: 'テスト2組' },
] as const;

export type SeededStaff = {
  staffId: number;
  userId: number;
  displayName: string;
};
export type SeededTeacher = {
  teacherId: number;
  userId: number;
  displayName: string;
};
export type SeededClassRoom = {
  classRoomId: number;
  classCode: string;
  className: string;
};

export type SeededData = {
  staffs: SeededStaff[];
  teachers: SeededTeacher[];
  classRooms: SeededClassRoom[];
  // staff/teacher を持たないユーザー（findAll で除外されることの検証用）
  student: { userId: number; displayName: string };
};

// テスト用の職員・教員データを返す関数。
// teachers[0] は classRooms[0] の担任として割り当て済み（担当クラスあり/参照ありのケース検証用）、
// teachers[1] はどのクラスも担当していない（担当クラスなしのケース検証用）。
export async function seedStaffsTeachers(db: D1Database): Promise<SeededData> {
  const orm = drizzle(db, { schema });

  await db.prepare('DELETE FROM gathering_group_members').run();
  await db.prepare('DELETE FROM notification_schedules').run();
  await db.prepare('DELETE FROM gatherings').run();
  await db.prepare('DELETE FROM events').run();
  await orm.delete(studentsTable);
  // class_rooms.teacher_id が teachers を、class_rooms.team_id が teams を
  // 参照しているため、teachers/teams を消す前に class_rooms 側を先に消す必要がある。
  await orm.delete(class_rooms);
  await db.prepare('DELETE FROM teams').run();
  await orm.delete(staffsTable);
  await orm.delete(teachersTable);
  await orm.delete(users);

  const now = new Date().toISOString();

  const seededStaffs: SeededStaff[] = [];
  for (const s of STAFFS) {
    const [user] = await orm
      .insert(users)
      .values({ userName: s.displayName, createdAt: now, updatedAt: now })
      .returning();

    const [staff] = await orm
      .insert(staffsTable)
      .values({ userId: user.id, createdAt: now, updatedAt: now })
      .returning();

    seededStaffs.push({
      staffId: staff.id,
      userId: user.id,
      displayName: s.displayName,
    });
  }

  const seededTeachers: SeededTeacher[] = [];
  for (const t of TEACHERS) {
    const [user] = await orm
      .insert(users)
      .values({ userName: t.displayName, createdAt: now, updatedAt: now })
      .returning();

    const [teacher] = await orm
      .insert(teachersTable)
      .values({ userId: user.id, createdAt: now, updatedAt: now })
      .returning();

    seededTeachers.push({
      teacherId: teacher.id,
      userId: user.id,
      displayName: t.displayName,
    });
  }

  const seededClassRooms: SeededClassRoom[] = [];
  for (const [index, c] of CLASS_ROOMS.entries()) {
    // 最初のクラスだけ最初の教員を担任として割り当てる
    const teacherId = index === 0 ? seededTeachers[0].teacherId : null;
    const { classRoomId } = await insertClassRoomWithTeam(db, {
      classCode: c.classCode,
      className: c.name,
      teacherId,
    });
    seededClassRooms.push({
      classRoomId,
      classCode: c.classCode,
      className: c.name,
    });
  }

  // staff/teacher を持たないユーザーを1名追加（findAll の inner join で除外される）
  const [student] = await orm
    .insert(users)
    .values({ userName: '田中生徒', createdAt: now, updatedAt: now })
    .returning();

  return {
    staffs: seededStaffs,
    teachers: seededTeachers,
    classRooms: seededClassRooms,
    student: { userId: student.id, displayName: student.userName },
  };
}
