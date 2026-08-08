import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { class_rooms, teachers, users } from '../database/schema';

import { D1Database } from '@cloudflare/workers-types';
import {
  TeacherCreateInput,
  TeacherEntity,
  TeacherPage,
  TeacherSearchFilter,
  TeacherUpdateInput,
} from '../../domain/entities/Teacher';
import { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';

const DEFAULT_OFFSET = 0;
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

  const rows = await orm
    .select()
    .from(class_rooms)
    .where(inArray(class_rooms.teacherId, teacherIds))
    .orderBy(
      asc(class_rooms.classCode),
      asc(class_rooms.name),
      asc(class_rooms.id)
    )
    .all();

  for (const row of rows) {
    // teacherId は上の where 句で絞り込み済みのため必ず値を持つ
    const teacherId = row.teacherId as number;
    const list = map.get(teacherId) ?? [];
    list.push(toClassRoom(row));
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
  const findTeacherById = async (id: number): Promise<TeacherEntity | null> => {
    const result = await orm
      .select()
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id))
      .where(eq(teachers.id, id))
      .get();

    if (!result) return null;

    const classRoomsByTeacher = await loadClassRoomsByTeacherIds(orm, [id]);
    return toEntity(result, classRoomsByTeacher.get(id) ?? []);
  };

  return {
    findById: findTeacherById,

    async findAll(filter: TeacherSearchFilter = {}): Promise<TeacherPage> {
      const offset =
        filter.offset !== undefined && filter.offset >= 0
          ? filter.offset
          : DEFAULT_OFFSET;
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
      if (filter.search) {
        const escapedPattern = `%${escapeLikePattern(filter.search)}%`;
        conditions.push(
          or(
            sql`${users.userName} LIKE ${escapedPattern} ESCAPE ${'\\'}`,
            sql`EXISTS (
              SELECT 1
              FROM class_rooms AS search_class_rooms
              WHERE search_class_rooms.teacher_id = ${teachers.id}
                AND (
                  search_class_rooms.class_code LIKE ${escapedPattern} ESCAPE ${'\\'}
                  OR search_class_rooms.class_name LIKE ${escapedPattern} ESCAPE ${'\\'}
                )
            )`
          )!
        );
      }
      if (filter.isLiveActive !== undefined) {
        conditions.push(eq(users.isLiveActive, filter.isLiveActive ? 1 : 0));
      }

      if (filter.classRoomId !== undefined) {
        const assignedTeacher = await orm
          .select({ teacherId: class_rooms.teacherId })
          .from(class_rooms)
          .where(eq(class_rooms.id, filter.classRoomId))
          .get();
        if (!assignedTeacher?.teacherId) {
          return { items: [], total: 0, limit, offset };
        }
        conditions.push(eq(teachers.id, assignedTeacher.teacherId));
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
      const filteredRowsQuery = whereClause
        ? rowsBaseQuery.where(whereClause)
        : rowsBaseQuery;
      const results = await (
        filter.sortBy === 'displayName'
          ? filteredRowsQuery.orderBy(
              filter.sortOrder === 'desc'
                ? desc(users.userName)
                : asc(users.userName),
              asc(teachers.id)
            )
          : filteredRowsQuery.orderBy(
              filter.sortOrder === 'desc' ? desc(teachers.id) : asc(teachers.id)
            )
      )
        .limit(limit)
        .offset(offset)
        .all();

      const teacherIds = results.map(r => r.teachers.id);
      const classRoomsByTeacher = await loadClassRoomsByTeacherIds(
        orm,
        teacherIds
      );
      const items = results.map(row =>
        toEntity(row, classRoomsByTeacher.get(row.teachers.id) ?? [])
      );

      return { items, total, limit, offset };
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

    async create(input: TeacherCreateInput): Promise<TeacherEntity> {
      const userInsert = db
        .prepare(
          `INSERT INTO users (user_name, is_live_active, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           RETURNING user_id`
        )
        .bind(input.userName, 1);
      const teacherInsert = db.prepare(
        `INSERT INTO teachers (user_id, updated_at)
           VALUES (last_insert_rowid(), CURRENT_TIMESTAMP)
           RETURNING teacher_id`
      );

      const statements = [userInsert, teacherInsert];
      if (input.classRoomIds.length > 0) {
        const placeholders = input.classRoomIds.map(() => '?').join(', ');
        statements.push(
          db
            .prepare(
              `UPDATE class_rooms
               SET teacher_id = last_insert_rowid(), updated_at = CURRENT_TIMESTAMP
               WHERE class_room_id IN (${placeholders})`
            )
            .bind(...input.classRoomIds)
        );
      }

      const results = await db.batch(statements);
      const teacherId = (
        results[1].results[0] as { teacher_id?: number } | undefined
      )?.teacher_id;
      if (!teacherId) {
        throw new Error('Failed to create teacher');
      }

      const created = await findTeacherById(teacherId);
      if (!created) {
        throw new Error('Failed to create teacher');
      }
      return created;
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
          updatedAt: now,
        })
        .where(eq(users.id, existing.users.id));

      // 1クラスの担当教員は最大1人のため、担当クラスの入れ替えは
      // class_rooms.teacher_id の付け替えで表現する。
      // まずこの教員が現在担当している全クラスを teacher_id = NULL に戻し、
      // そのうえで新しい classRoomIds に対してのみ teacher_id = id を立て直す。
      // D1のbatch()は複数文を1つのトランザクションとして原子的に実行するため、
      // 途中の文が失敗しても users の更新や担当クラスの解除が
      // 反映されたまま残ることはない。
      const clearAssignmentsStatement = orm
        .update(class_rooms)
        .set({ teacherId: null, updatedAt: now })
        .where(eq(class_rooms.teacherId, id));

      if (input.classRoomIds.length > 0) {
        // class_rooms.teacher_id への UPDATE は、存在しないIDを条件に含めても
        // 単に0件更新で成功してしまいFK制約による検知が働かない。
        // そのため、事前にSELECTで対象クラスが全件実在することを確認し、
        // 欠けていれば users 更新も含めて何もコミットせずに失敗させる。
        const existingClassRooms = await orm
          .select({ id: class_rooms.id })
          .from(class_rooms)
          .where(inArray(class_rooms.id, input.classRoomIds))
          .all();
        if (existingClassRooms.length !== input.classRoomIds.length) {
          throw new Error('Class room not found');
        }

        const setAssignmentsStatement = orm
          .update(class_rooms)
          .set({ teacherId: id, updatedAt: now })
          .where(inArray(class_rooms.id, input.classRoomIds));
        await orm.batch([
          updateUserStatement,
          clearAssignmentsStatement,
          setAssignmentsStatement,
        ]);
      } else {
        await orm.batch([updateUserStatement, clearAssignmentsStatement]);
      }

      const classRoomsByTeacher = await loadClassRoomsByTeacherIds(orm, [id]);
      return toEntity(
        {
          teachers: existing.teachers,
          users: {
            ...existing.users,
            userName: input.userName,
            updatedAt: now,
          },
        },
        classRoomsByTeacher.get(id) ?? []
      );
    },

    async hasClassAssignments(id: number): Promise<boolean> {
      const row = await orm
        .select({ id: class_rooms.id })
        .from(class_rooms)
        .where(eq(class_rooms.teacherId, id))
        .get();
      return Boolean(row);
    },

    async delete(id: number): Promise<boolean> {
      // class_rooms.teacher_id は ON DELETE の挙動を明示していない外部キーのため、
      // 割り当てが残ったまま削除しようとするとFK制約違反になる。
      // hasClassAssignments によるチェックと実際の delete の間に、別リクエストが
      // 担当クラスを新規に割り当てる競合が起きても、このエラーを検知して
      // 呼び出し元（Service層）が既存の参照エラーと同じ扱いをできるようにする。
      try {
        const row = await orm
          .delete(teachers)
          .where(eq(teachers.id, id))
          .returning()
          .get();
        return Boolean(row);
      } catch (err) {
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
