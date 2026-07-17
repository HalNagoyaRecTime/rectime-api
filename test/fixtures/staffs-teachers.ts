import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../../src/infrastructure/database/schema';
import {
  firebase_tokens,
  microsoft_account_links,
  staffs,
  students,
  teachers,
  users,
} from '../../src/infrastructure/database/schema';

const STAFF_NAMES = ['職員A', '職員B', '職員C'] as const;
const TEACHER_NAMES = ['教員A', '教員B', '教員C'] as const;

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

export type SeededStaffTeacherData = {
  staffs: SeededStaff[];
  teachers: SeededTeacher[];
  unassignedUserId: number;
};

export async function seedStaffsAndTeachers(
  db: D1Database
): Promise<SeededStaffTeacherData> {
  const orm = drizzle(db, { schema });
  const now = new Date().toISOString();

  await db.prepare('DELETE FROM gathering_group_members').run();
  await db.prepare('DELETE FROM notification_schedules').run();
  await db.prepare('DELETE FROM gatherings').run();
  await db.prepare('DELETE FROM events').run();
  await orm.delete(firebase_tokens);
  await orm.delete(microsoft_account_links);
  await orm.delete(students);
  await orm.delete(staffs);
  await orm.delete(teachers);
  await orm.delete(users);

  const seededStaffs: SeededStaff[] = [];
  for (const displayName of STAFF_NAMES) {
    const [user] = await orm
      .insert(users)
      .values({
        userName: displayName,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [staff] = await orm
      .insert(staffs)
      .values({
        userId: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    seededStaffs.push({
      staffId: staff.id,
      userId: user.id,
      displayName,
    });
  }

  const seededTeachers: SeededTeacher[] = [];
  for (const displayName of TEACHER_NAMES) {
    const [user] = await orm
      .insert(users)
      .values({
        userName: displayName,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [teacher] = await orm
      .insert(teachers)
      .values({
        userId: user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    seededTeachers.push({
      teacherId: teacher.id,
      userId: user.id,
      displayName,
    });
  }

  const [unassignedUser] = await orm
    .insert(users)
    .values({
      userName: '未割当ユーザー',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return {
    staffs: seededStaffs,
    teachers: seededTeachers,
    unassignedUserId: unassignedUser.id,
  };
}
