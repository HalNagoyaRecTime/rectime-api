import type { D1Database } from '@cloudflare/workers-types';
import {
  aliasedTable,
  and,
  asc,
  countDistinct,
  eq,
  isNotNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { class_rooms, students, teachers, users } from '../database/schema';
import type {
  UserSearchCategory,
  UserSearchFilter,
  UserSearchItem,
  UserSearchResult,
} from '../../domain/entities/UserSearch';
import type { IUserSearchRepository } from '../../domain/interfaces/repositories/IUserSearchRepository';

type UserSearchRow = {
  user_id: number;
  display_name: string;
  is_live_active: number;
  student_user_id: number | null;
  teacher_user_id: number | null;
};

const searchUsers = aliasedTable(users, 'search_users');

export function createUserSearchRepository(
  db: D1Database
): IUserSearchRepository {
  const orm = drizzle(db, { schema });

  return {
    async findAll(filter): Promise<UserSearchResult> {
      const whereClause = buildWhereClause(filter);

      const rowsQuery = orm
        .select({
          user_id: searchUsers.id,
          display_name: searchUsers.userName,
          is_live_active: searchUsers.isLiveActive,
          student_user_id: students.userId,
          teacher_user_id: teachers.userId,
        })
        .from(searchUsers)
        .leftJoin(students, eq(students.userId, searchUsers.id))
        .leftJoin(teachers, eq(teachers.userId, searchUsers.id));
      const countQuery = orm
        .select({ total: countDistinct(searchUsers.id) })
        .from(searchUsers)
        .leftJoin(students, eq(students.userId, searchUsers.id))
        .leftJoin(teachers, eq(teachers.userId, searchUsers.id));

      const [rows, totalResult] = await Promise.all([
        (whereClause ? rowsQuery.where(whereClause) : rowsQuery)
          .orderBy(asc(searchUsers.id))
          .limit(filter.limit)
          .offset(filter.offset)
          .all(),
        (whereClause ? countQuery.where(whereClause) : countQuery).get(),
      ]);

      return {
        items: rows.map(toItem),
        total: totalResult?.total ?? 0,
      };
    },
  };
}

function buildWhereClause(filter: UserSearchFilter): SQL | undefined {
  const conditions: SQL[] = [];

  if (filter.status !== 'all') {
    conditions.push(
      eq(searchUsers.isLiveActive, filter.status === 'active' ? 1 : 0)
    );
  }

  if (filter.category === 'student') {
    conditions.push(isNotNull(students.userId));
  } else if (filter.category === 'teacher') {
    conditions.push(isNotNull(teachers.userId));
  }

  if (filter.q !== undefined) {
    const pattern = `%${escapeLikePattern(filter.q)}%`;
    const searchConditions: SQL[] = [
      sql`${searchUsers.userName} LIKE ${pattern} ESCAPE ${'\\'}`,
      sql`EXISTS (
        SELECT 1
        FROM ${students}
        INNER JOIN ${class_rooms}
          ON ${class_rooms.id} = ${students.classRoomId}
        WHERE ${students.userId} = ${searchUsers.id}
          AND (
            ${class_rooms.classCode} LIKE ${pattern} ESCAPE ${'\\'}
            OR ${class_rooms.name} LIKE ${pattern} ESCAPE ${'\\'}
          )
      )`,
      sql`EXISTS (
        SELECT 1
        FROM ${teachers}
        INNER JOIN ${class_rooms}
          ON ${class_rooms.teacherId} = ${teachers.id}
        WHERE ${teachers.userId} = ${searchUsers.id}
          AND (
            ${class_rooms.classCode} LIKE ${pattern} ESCAPE ${'\\'}
            OR ${class_rooms.name} LIKE ${pattern} ESCAPE ${'\\'}
          )
      )`,
    ];

    const numericUserId = parseNumericUserId(filter.q);
    if (numericUserId !== null) {
      searchConditions.push(eq(searchUsers.id, numericUserId));
    }
    conditions.push(or(...searchConditions)!);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function parseNumericUserId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}

function toItem(row: UserSearchRow): UserSearchItem {
  const categories: UserSearchCategory[] = [];
  if (row.student_user_id !== null) categories.push('student');
  if (row.teacher_user_id !== null) categories.push('teacher');

  return {
    user_id: row.user_id,
    display_name: row.display_name,
    is_live_active: row.is_live_active === 1,
    categories,
  };
}
