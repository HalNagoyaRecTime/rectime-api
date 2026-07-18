import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import {
  staffs as staffsTable,
  teachers as teachersTable,
  students as studentsTable,
  users,
} from '../../src/infrastructure/database/schema';

// テスト専用の職員・教員データ。マイグレーションのシードには依存しない。
const STAFFS = [
  { displayName: '佐々木職員' },
  { displayName: '伊藤職員' },
] as const;

const TEACHERS = [
  { displayName: '山田先生' },
  { displayName: '中村先生' },
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

export type SeededData = {
  staffs: SeededStaff[];
  teachers: SeededTeacher[];
  // staff/teacher を持たないユーザー（findAll で除外されることの検証用）
  student: { userId: number; displayName: string };
};

// テスト用の職員・教員データを返す関数。
export async function seedStaffsTeachers(db: D1Database): Promise<SeededData> {
  const orm = drizzle(db, { schema });

  await db.prepare('DELETE FROM gathering_group_members').run();
  await db.prepare('DELETE FROM notification_schedules').run();
  await db.prepare('DELETE FROM gatherings').run();
  await db.prepare('DELETE FROM events').run();
  await orm.delete(staffsTable);
  await orm.delete(teachersTable);
  await orm.delete(studentsTable);
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

  // staff/teacher を持たないユーザーを1名追加（findAll の inner join で除外される）
  const [student] = await orm
    .insert(users)
    .values({ userName: '田中生徒', createdAt: now, updatedAt: now })
    .returning();

  return {
    staffs: seededStaffs,
    teachers: seededTeachers,
    student: { userId: student.id, displayName: student.userName },
  };
}
