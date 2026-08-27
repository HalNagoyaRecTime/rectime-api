import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../database/schema';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { class_rooms, teachers, users } from '../database/schema';

import { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import {
  TeacherEntity,
  TeacherPage,
  TeacherSearchFilter,
  TeacherUpdateInput,
  TeacherCreateInput,
} from '../../domain/entities/Teacher';
import {
  ITeacherRepository,
  NewTeacherInput,
} from '../../domain/interfaces/repositories/ITeacherRepository';
import { chunkArray } from './chunk';

const D1_MAX_BOUND_PARAMETERS = 100;

type ReturnedUserRow = {
  user_id: number;
  user_name: string;
  is_live_active: number;
};

type ReturnedTeacherRow = {
  teacher_id: number;
  user_id: number;
};

const DEFAULT_OFFSET = 0;
const DEFAULT_LIMIT = 50;

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
              SELECT 1 FROM class_rooms search_class_rooms
              WHERE search_class_rooms.teacher_id = teachers.teacher_id
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
      } else {
        conditions.push(eq(users.isLiveActive, 1));
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
      const sortOrder = filter.sortOrder === 'desc' ? desc : asc;
      const sortColumn =
        filter.sortBy === 'displayName' ? users.userName : teachers.id;
      const results = await (
        whereClause ? rowsBaseQuery.where(whereClause) : rowsBaseQuery
      )
        .orderBy(sortOrder(sortColumn), asc(teachers.id))
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

    async create(
      input: NewTeacherInput | TeacherCreateInput
    ): Promise<TeacherEntity> {
      const displayName =
        'userName' in input ? input.userName : input.displayName;
      const classRoomIds = 'userName' in input ? input.classRoomIds : [];
      const hasClassRoomAssignments = classRoomIds.length > 0;

      // classRoomIds の件数ぶんだけ '?' を並べたもの（例: '?, ?, ?'）。
      // IN 句と存在確認の両方で使い回す。
      const classRoomIdPlaceholders = classRoomIds.map(() => '?').join(', ');
      // 「指定された class_room_id が全件実在するか」を表す条件式。
      // 末尾の ? には classRoomIds.length を bind する。
      const classRoomsExistCondition = `(SELECT COUNT(*) FROM class_rooms
                        WHERE class_room_id IN (${classRoomIdPlaceholders})) = ?`;

      // classRoomIds の存在確認を各文の条件に含めることで、存在確認と
      // users/teachers の作成・クラス紐付けを同じ batch 内で扱う。
      // 対象クラスが欠けている場合は全ての書き込みが実行されないため、
      // 教員だけが作成される状態を防げる。
      const batchResults = hasClassRoomAssignments
        ? await db.batch<
            ReturnedUserRow | ReturnedTeacherRow | { class_room_id: number }
          >([
            db
              .prepare(
                `INSERT INTO users (user_name, updated_at)
                 SELECT ?, CURRENT_TIMESTAMP
                 WHERE ${classRoomsExistCondition}
                 RETURNING user_id, user_name, is_live_active`
              )
              .bind(displayName, ...classRoomIds, classRoomIds.length),
            db
              .prepare(
                `INSERT INTO teachers (user_id, updated_at)
                 SELECT last_insert_rowid(), CURRENT_TIMESTAMP
                 WHERE ${classRoomsExistCondition}
                 RETURNING teacher_id, user_id`
              )
              .bind(...classRoomIds, classRoomIds.length),
            db
              .prepare(
                `UPDATE class_rooms
                 SET teacher_id = last_insert_rowid(),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE class_room_id IN (${classRoomIdPlaceholders})
                   AND ${classRoomsExistCondition}
                 RETURNING class_room_id`
              )
              .bind(...classRoomIds, ...classRoomIds, classRoomIds.length),
          ])
        : await db.batch<ReturnedUserRow | ReturnedTeacherRow>([
            db
              .prepare(
                `INSERT INTO users (user_name, updated_at)
                 VALUES (?, CURRENT_TIMESTAMP)
                 RETURNING user_id, user_name, is_live_active`
              )
              .bind(displayName),
            db.prepare(
              `INSERT INTO teachers (user_id, updated_at)
               VALUES (last_insert_rowid(), CURRENT_TIMESTAMP)
               RETURNING teacher_id, user_id`
            ),
          ]);

      const [userResult, teacherResult] = batchResults;

      const user = userResult.results[0] as ReturnedUserRow | undefined;
      const created = teacherResult.results[0] as
        | ReturnedTeacherRow
        | undefined;
      if (!user || !created) {
        if (hasClassRoomAssignments) {
          throw new Error('Class room not found');
        }
        throw new Error('Failed to create teacher');
      }

      if (hasClassRoomAssignments) {
        const assignmentResult = batchResults[2];
        if (assignmentResult.results.length !== classRoomIds.length) {
          throw new Error('Failed to assign class rooms');
        }
      }

      const result = await orm
        .select()
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(eq(teachers.id, created.teacher_id))
        .get();
      if (!result) throw new Error('Failed to create teacher');
      const classRoomsByTeacher = await loadClassRoomsByTeacherIds(orm, [
        created.teacher_id,
      ]);
      return toEntity(
        result,
        classRoomsByTeacher.get(created.teacher_id) ?? []
      );
    },

    async createMany(inputs: NewTeacherInput[]): Promise<void> {
      if (inputs.length === 0) {
        return;
      }

      const userStatements: D1PreparedStatement[] = [];
      for (const chunk of chunkArray(inputs, D1_MAX_BOUND_PARAMETERS)) {
        const placeholders = chunk
          .map(() => '(?, CURRENT_TIMESTAMP)')
          .join(', ');
        const values = chunk.map(input => input.displayName);
        userStatements.push(
          db
            .prepare(
              `INSERT INTO users (user_name, updated_at) VALUES ${placeholders} RETURNING user_id`
            )
            .bind(...values)
        );
      }

      const userResults = await db.batch<{ user_id: number }>(userStatements);
      const userIds: number[] = [];
      for (const result of userResults) {
        for (const row of result.results) {
          userIds.push(row.user_id);
        }
      }

      try {
        const teacherStatements: D1PreparedStatement[] = [];
        for (const chunk of chunkArray(userIds, D1_MAX_BOUND_PARAMETERS)) {
          const placeholders = chunk
            .map(() => '(?, CURRENT_TIMESTAMP)')
            .join(', ');
          teacherStatements.push(
            db
              .prepare(
                `INSERT INTO teachers (user_id, updated_at) VALUES ${placeholders}`
              )
              .bind(...chunk)
          );
        }
        await db.batch(teacherStatements);
      } catch (error) {
        try {
          await deleteUsersByIds(db, userIds);
        } catch (userDeletionError) {
          console.error(
            'Error deleting users after teacher creation failure:',
            userDeletionError
          );
        }
        throw error;
      }
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
      if (!existing || existing.users.isLiveActive !== 1) return null;

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
  };
}

async function deleteUsersByIds(db: D1Database, userIds: number[]) {
  for (const chunk of chunkArray(userIds, D1_MAX_BOUND_PARAMETERS)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM users WHERE user_id IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}
