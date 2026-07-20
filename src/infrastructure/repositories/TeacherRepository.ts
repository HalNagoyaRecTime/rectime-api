import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  class_rooms,
  teacher_class_assignments,
  teachers,
  users,
} from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import {
  TeacherEntity,
  TeacherPage,
  TeacherSearchFilter,
  TeacherUpdateInput,
} from '../../domain/entities/Teacher';
import { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// LIKE検索の対象文字列に % や _ そのものが含まれていても、ワイルドカードとして
// 展開されず文字通りに一致するよう、SQLiteの ESCAPE 句と組み合わせて使う。
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}

type TeacherJoinRow = {
  teachers: typeof teachers.$inferSelect;
  users: typeof users.$inferSelect;
};

type ClassRoomAssignmentRow = {
  teacher_class_assignments: typeof teacher_class_assignments.$inferSelect;
  class_rooms: typeof class_rooms.$inferSelect;
};

function toClassRoom(row: typeof class_rooms.$inferSelect) {
  return {
    class_room_id: row.id,
    class_code: row.classCode,
    class_name: row.name,
  };
}

async function loadClassRoomsByTeacherIds(
  orm: ReturnType<typeof drizzle>,
  teacherIds: number[]
): Promise<Map<number, ReturnType<typeof toClassRoom>[]>> {
  const map = new Map<number, ReturnType<typeof toClassRoom>[]>();
  if (teacherIds.length === 0) return map;

  const rows = (await orm
    .select()
    .from(teacher_class_assignments)
    .innerJoin(
      class_rooms,
      eq(teacher_class_assignments.classRoomId, class_rooms.id)
    )
    .where(inArray(teacher_class_assignments.teacherId, teacherIds))
    .all()) as ClassRoomAssignmentRow[];

  for (const row of rows) {
    const teacherId = row.teacher_class_assignments.teacherId;
    const list = map.get(teacherId) ?? [];
    list.push(toClassRoom(row.class_rooms));
    map.set(teacherId, list);
  }
  return map;
}

function toEntity(
  row: TeacherJoinRow,
  classRooms: ReturnType<typeof toClassRoom>[]
): TeacherEntity {
  return {
    teacher_id: row.teachers.id,
    user_id: row.users.id,
    user_name: row.users.userName,
    is_live_active: Boolean(row.users.isLiveActive),
    class_rooms: classRooms,
  };
}

export function createTeacherRepository(db: D1Database): ITeacherRepository {
  const orm = drizzle(db, { schema });
  return {
    async findById(id: number): Promise<TeacherEntity | null> {
      const result = await orm
        .select()
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(eq(teachers.id, id))
        .get();

      if (!result) return null;

      const classRoomsByTeacher = await loadClassRoomsByTeacherIds(orm, [id]);
      return toEntity(result, classRoomsByTeacher.get(id) ?? []);
    },

    async findAll(filter: TeacherSearchFilter = {}): Promise<TeacherPage> {
      const page =
        filter.page !== undefined && filter.page > 0
          ? filter.page
          : DEFAULT_PAGE;
      const limit =
        filter.limit !== undefined && filter.limit > 0
          ? filter.limit
          : DEFAULT_LIMIT;

      const conditions = [];
      if (filter.teacherId !== undefined) {
        conditions.push(eq(teachers.id, filter.teacherId));
      }
      if (filter.userName) {
        const escapedPattern = `%${escapeLikePattern(filter.userName)}%`;
        conditions.push(
          sql`${users.userName} LIKE ${escapedPattern} ESCAPE ${'\\'}`
        );
      }
      if (filter.isLiveActive !== undefined) {
        conditions.push(eq(users.isLiveActive, filter.isLiveActive ? 1 : 0));
      }

      if (filter.classRoomId !== undefined) {
        const assignmentRows = await orm
          .select({ teacherId: teacher_class_assignments.teacherId })
          .from(teacher_class_assignments)
          .where(eq(teacher_class_assignments.classRoomId, filter.classRoomId))
          .all();
        const teacherIdsForClassFilter = assignmentRows.map(r => r.teacherId);
        if (teacherIdsForClassFilter.length === 0) {
          return { items: [], total: 0, page, limit };
        }
        conditions.push(inArray(teachers.id, teacherIdsForClassFilter));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const countBaseQuery = orm
        .select({ count: sql<number>`count(*)` })
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id));
      const countResult = await (
        whereClause ? countBaseQuery.where(whereClause) : countBaseQuery
      ).get();
      const total = countResult?.count ?? 0;

      const rowsBaseQuery = orm
        .select()
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id));
      const results = await (
        whereClause ? rowsBaseQuery.where(whereClause) : rowsBaseQuery
      )
        .orderBy(asc(teachers.id))
        .limit(limit)
        .offset((page - 1) * limit)
        .all();

      const teacherIds = results.map(r => r.teachers.id);
      const classRoomsByTeacher = await loadClassRoomsByTeacherIds(
        orm,
        teacherIds
      );
      const items = results.map(row =>
        toEntity(row, classRoomsByTeacher.get(row.teachers.id) ?? [])
      );

      return { items, total, page, limit };
    },

    async existsClassRooms(classRoomIds: number[]): Promise<boolean> {
      if (classRoomIds.length === 0) return true;
      const rows = await orm
        .select({ id: class_rooms.id })
        .from(class_rooms)
        .where(inArray(class_rooms.id, classRoomIds))
        .all();
      return rows.length === classRoomIds.length;
    },

    async update(
      id: number,
      input: TeacherUpdateInput
    ): Promise<TeacherEntity | null> {
      const existing = await orm
        .select()
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(eq(teachers.id, id))
        .get();
      if (!existing) return null;

      const now = new Date().toISOString();

      const updateUserStatement = orm
        .update(users)
        .set({
          userName: input.userName,
          isLiveActive: input.isLiveActive ? 1 : 0,
          updatedAt: now,
        })
        .where(eq(users.id, existing.users.id));

      const deleteAssignmentsStatement = orm
        .delete(teacher_class_assignments)
        .where(eq(teacher_class_assignments.teacherId, id));

      // D1のbatch()は複数文を1つのトランザクションとして原子的に実行するため、
      // 途中の文が失敗しても users の更新や既存の担当クラス削除が
      // 反映されたまま残ることはない。
      if (input.classRoomIds.length > 0) {
        const insertAssignmentsStatement = orm
          .insert(teacher_class_assignments)
          .values(
            input.classRoomIds.map(classRoomId => ({
              teacherId: id,
              classRoomId,
              createdAt: now,
              updatedAt: now,
            }))
          );
        await orm.batch([
          updateUserStatement,
          deleteAssignmentsStatement,
          insertAssignmentsStatement,
        ]);
      } else {
        await orm.batch([updateUserStatement, deleteAssignmentsStatement]);
      }

      const classRoomsByTeacher = await loadClassRoomsByTeacherIds(orm, [id]);
      return toEntity(
        {
          teachers: existing.teachers,
          users: {
            ...existing.users,
            userName: input.userName,
            isLiveActive: input.isLiveActive ? 1 : 0,
            updatedAt: now,
          },
        },
        classRoomsByTeacher.get(id) ?? []
      );
    },

    async hasClassAssignments(id: number): Promise<boolean> {
      const row = await orm
        .select({ id: teacher_class_assignments.id })
        .from(teacher_class_assignments)
        .where(eq(teacher_class_assignments.teacherId, id))
        .get();
      return Boolean(row);
    },

    async delete(id: number): Promise<boolean> {
      try {
        const row = await orm
          .delete(teachers)
          .where(eq(teachers.id, id))
          .returning()
          .get();
        return Boolean(row);
      } catch (err) {
        // hasClassAssignments によるチェックと実際の delete の間に、別リクエストが
        // 担当クラスを新規に割り当てる競合が起きると、teacher_class_assignments
        // 側のFK制約違反でここに到達し得る。SQLiteのエラーメッセージで判別し、
        // 呼び出し元（Service層）が既存の参照エラーと同じ扱いをできるようにする。
        const message =
          err instanceof Error && err.cause instanceof Error
            ? err.cause.message
            : err instanceof Error
              ? err.message
              : String(err);
        if (message.includes('FOREIGN KEY constraint failed')) {
          throw new Error('Teacher is referenced by other data');
        }
        throw err;
      }
    },
  };
}
