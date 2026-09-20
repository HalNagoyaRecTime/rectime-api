import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import * as schema from '../database/schema';
import { class_rooms, students, teachers, users } from '../database/schema';
import type {
  ClassRoomEntity,
  ClassRoomInput,
  ClassRoomPage,
  ClassRoomSearchFilter,
} from '../../domain/entities/ClassRoom';
import { buildProvisionalTeamName } from '../../domain/entities/Team';
import type { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { chunkArray } from './chunk';
import { buildCleanupEmptyTeamStatements } from './teamCleanup';
import { escapeLikePattern } from '../helpers/escapeLikePattern';

const DEFAULT_LIMIT = 50;
const D1_MAX_BOUND_PARAMETERS = 100;

function unwrapDatabaseError(error: unknown): unknown {
  const visited = new Set<Error>();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    if (!(current.cause instanceof Error)) return current;
    current = current.cause;
  }
  return current;
}

type ClassRoomRow = {
  classRoomId: number;
  classCode: string;
  className: string;
  studentCount: number;
  teamId: number;
  teacherId: number | null;
  teacherUserId: number | null;
  teacherDisplayName: string | null;
};

function provisionalTeamName(
  input: Pick<ClassRoomInput, 'classCode' | 'className'>
): string {
  return buildProvisionalTeamName({
    className: input.className,
    classCode: input.classCode,
  });
}

function toEntity(row: ClassRoomRow): ClassRoomEntity {
  return {
    classRoomId: row.classRoomId,
    classCode: row.classCode,
    className: row.className,
    studentCount: Number(row.studentCount),
    teamId: row.teamId,
    teacher:
      row.teacherId === null ||
      row.teacherUserId === null ||
      row.teacherDisplayName === null
        ? null
        : {
            teacherId: row.teacherId,
            userId: row.teacherUserId,
            displayName: row.teacherDisplayName,
          },
  };
}

export function createClassRoomRepository(
  db: D1Database
): IClassRoomRepository {
  const orm = drizzle(db, { schema });

  const findOne = async (condition: SQL): Promise<ClassRoomEntity | null> => {
    const row = await orm
      .select({
        classRoomId: class_rooms.id,
        classCode: class_rooms.classCode,
        className: class_rooms.name,
        studentCount: sql<number>`count(${students.id})`,
        teamId: class_rooms.teamId,
        teacherId: teachers.id,
        teacherUserId: users.id,
        teacherDisplayName: users.userName,
      })
      .from(class_rooms)
      .leftJoin(teachers, eq(teachers.id, class_rooms.teacherId))
      // 無効化された教員は担任として扱わない。class_rooms.teacher_id は残すので、
      // 再有効化すれば元の担任に戻る。
      .leftJoin(
        users,
        and(eq(users.id, teachers.userId), eq(users.isLiveActive, 1))
      )
      .leftJoin(students, eq(students.classRoomId, class_rooms.id))
      .where(condition)
      .groupBy(
        class_rooms.id,
        class_rooms.classCode,
        class_rooms.name,
        class_rooms.teamId,
        teachers.id,
        users.id,
        users.userName
      )
      .limit(1)
      .get();

    return row ? toEntity(row) : null;
  };

  const findPage = async (
    filter: ClassRoomSearchFilter = {}
  ): Promise<ClassRoomPage> => {
    const limit =
      filter.limit && filter.limit > 0
        ? Math.min(filter.limit, 100)
        : DEFAULT_LIMIT;
    const offset =
      filter.offset !== undefined && filter.offset >= 0 ? filter.offset : 0;
    const conditions = [];
    if (filter.search) {
      const pattern = `%${escapeLikePattern(filter.search)}%`;
      conditions.push(
        or(
          sql`${class_rooms.classCode} LIKE ${pattern} ESCAPE ${'\\'}`,
          sql`${class_rooms.name} LIKE ${pattern} ESCAPE ${'\\'}`,
          sql`CAST(${class_rooms.id} AS TEXT) LIKE ${pattern} ESCAPE ${'\\'}`,
          sql`${users.userName} LIKE ${pattern} ESCAPE ${'\\'}`
        )!
      );
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rowsQuery = orm
      .select({
        classRoomId: class_rooms.id,
        classCode: class_rooms.classCode,
        className: class_rooms.name,
        studentCount: sql<number>`count(${students.id})`,
        teamId: class_rooms.teamId,
        teacherId: teachers.id,
        teacherUserId: users.id,
        teacherDisplayName: users.userName,
      })
      .from(class_rooms)
      .leftJoin(teachers, eq(teachers.id, class_rooms.teacherId))
      // 無効化された教員は担任として扱わない。class_rooms.teacher_id は残すので、
      // 再有効化すれば元の担任に戻る。
      .leftJoin(
        users,
        and(eq(users.id, teachers.userId), eq(users.isLiveActive, 1))
      )
      .leftJoin(students, eq(students.classRoomId, class_rooms.id));
    const countQuery = orm
      .select({ total: sql<number>`count(distinct ${class_rooms.id})` })
      .from(class_rooms)
      .leftJoin(teachers, eq(teachers.id, class_rooms.teacherId))
      .leftJoin(
        users,
        and(eq(users.id, teachers.userId), eq(users.isLiveActive, 1))
      );

    const order = filter.sortOrder === 'desc' ? desc : asc;
    const sortColumn =
      filter.sortBy === 'classCode'
        ? class_rooms.classCode
        : filter.sortBy === 'className'
          ? class_rooms.name
          : filter.sortBy === 'teacherName'
            ? users.userName
            : filter.sortBy === 'studentCount'
              ? sql<number>`count(${students.id})`
              : class_rooms.id;

    const [totalRow, rows] = await Promise.all([
      (whereClause ? countQuery.where(whereClause) : countQuery).get(),
      (whereClause ? rowsQuery.where(whereClause) : rowsQuery)
        .groupBy(
          class_rooms.id,
          class_rooms.classCode,
          class_rooms.name,
          teachers.id,
          users.id,
          users.userName
        )
        .orderBy(
          ...(filter.sortBy === 'teacherName'
            ? [
                sql<number>`CASE WHEN ${users.userName} IS NULL THEN 1 ELSE 0 END`,
              ]
            : []),
          order(sortColumn),
          asc(class_rooms.id)
        )
        .limit(limit)
        .offset(offset)
        .all(),
    ]);

    const items = rows.map(toEntity);
    return {
      items,
      total: Number(totalRow?.total ?? 0),
      limit,
      offset,
    };
  };

  return {
    async findAll(filter: ClassRoomSearchFilter = {}) {
      return findPage(filter);
    },
    async findById(id) {
      return findOne(eq(class_rooms.id, id));
    },
    async findByCode(classCode) {
      return findOne(eq(class_rooms.classCode, classCode));
    },
    async findExistingClassRoomIds(classRoomIds) {
      const found = new Set<number>();
      for (const chunk of chunkArray(
        Array.from(new Set(classRoomIds)),
        D1_MAX_BOUND_PARAMETERS
      )) {
        if (chunk.length === 0) continue;
        const rows = await orm
          .select({ id: class_rooms.id })
          .from(class_rooms)
          .where(inArray(class_rooms.id, chunk))
          .all();
        rows.forEach(row => found.add(row.id));
      }
      return found;
    },
    async findExistingClassCodes(classCodes) {
      const found = new Set<string>();
      for (const chunk of chunkArray(
        Array.from(new Set(classCodes)),
        D1_MAX_BOUND_PARAMETERS
      )) {
        if (chunk.length === 0) continue;
        const rows = await orm
          .select({ classCode: class_rooms.classCode })
          .from(class_rooms)
          .where(inArray(class_rooms.classCode, chunk))
          .all();
        rows.forEach(row => found.add(row.classCode));
      }
      return found;
    },

    async create(input: ClassRoomInput): Promise<ClassRoomEntity> {
      if (input.teamId !== null) {
        let row;
        try {
          row = await orm
            .insert(class_rooms)
            .values({
              classCode: input.classCode,
              name: input.className,
              teacherId: input.teacherId,
              teamId: input.teamId,
            })
            .returning({ id: class_rooms.id })
            .get();
        } catch (error) {
          throw unwrapDatabaseError(error);
        }
        if (!row) throw new Error('Failed to create class');
        const created = await findOne(eq(class_rooms.id, row.id));
        if (!created) throw new Error('Failed to fetch created class');
        return created;
      }

      // team_id未指定時は、このクラス単独の暫定チームを自動作成する。
      const [, classRoomResult] = await db.batch<
        { team_id: number } | { class_room_id: number }
      >([
        db
          .prepare('INSERT INTO teams (team_name) VALUES (?)')
          .bind(provisionalTeamName(input)),
        db
          .prepare(
            `INSERT INTO class_rooms (class_code, class_name, teacher_id, team_id)
             SELECT ?, ?, ?, team_id FROM teams WHERE team_name = ?
             RETURNING class_room_id`
          )
          .bind(
            input.classCode,
            input.className,
            input.teacherId,
            provisionalTeamName(input)
          ),
      ]);
      const row = classRoomResult.results[0] as
        | { class_room_id: number }
        | undefined;
      if (!row) throw new Error('Failed to create class');
      const created = await findOne(eq(class_rooms.id, row.class_room_id));
      if (!created) throw new Error('Failed to fetch created class');
      return created;
    },

    async createMany(inputs: Omit<ClassRoomInput, 'teamId'>[]): Promise<void> {
      if (inputs.length === 0) {
        return;
      }

      const committedInputs: Omit<ClassRoomInput, 'teamId'>[] = [];
      try {
        for (const chunk of chunkArray(
          inputs,
          Math.floor(D1_MAX_BOUND_PARAMETERS / 5)
        )) {
          const teamPlaceholders = chunk.map(() => '(?)').join(', ');
          const teamValues = chunk.map(provisionalTeamName);
          const statements: D1PreparedStatement[] = [
            db
              .prepare(
                `INSERT INTO teams (team_name) VALUES ${teamPlaceholders}`
              )
              .bind(...teamValues),
          ];
          for (const input of chunk) {
            statements.push(
              db
                .prepare(
                  `INSERT INTO class_rooms (class_code, class_name, teacher_id, team_id)
                   SELECT ?, ?, ?, team_id FROM teams WHERE team_name = ?`
                )
                .bind(
                  input.classCode,
                  input.className,
                  input.teacherId,
                  provisionalTeamName(input)
                )
            );
          }
          await db.batch(statements);
          committedInputs.push(...chunk);
        }
      } catch (error) {
        if (committedInputs.length > 0) {
          try {
            await deleteClassRoomsAndTeamsByInputs(db, committedInputs);
          } catch (cleanupError) {
            console.error(
              'Error deleting already-committed class rooms after createMany failure:',
              cleanupError
            );
            throw new Error(
              `クラスの登録に失敗し、さらに登録済み分の削除にも失敗しました。手動でのデータ確認が必要です。:${String(cleanupError)}`,
              { cause: error }
            );
          }
        }
        throw error;
      }
    },

    async update(id, input) {
      // 無効化された教員は担任として返していないため、呼び出し側が受け取った
      // 教室にはそもそも担任が乗っていない。それをそのまま送り返してくる
      // teacherId = null を「担任を外す」と解釈すると、表示から隠しただけの
      // 割り当てまで消えてしまう。担任が停止中のときの null は据え置きとして扱う。
      //
      // 既知の制約: この判定はUPDATE実行時点のDBの状態を見ている。教室の編集は
      // GETとPUTの2リクエストにまたがるため、その間に別操作で担任が再有効化されると、
      // GET時点でnullだった値がそのまま送られて割り当てを消してしまう。塞ぐには
      // GET時点の状態を持ち回る仕組み（更新時刻を条件に含める楽観ロックなど）が要るが、
      // 全項目置換のPUTすべてに関わる設計変更になるため、ここでは扱わない。
      let row;
      try {
        row = await db
          .prepare(
            `UPDATE class_rooms
               SET class_code = ?,
                   class_name = ?,
                   teacher_id = CASE
                     WHEN ? IS NULL AND EXISTS (
                       SELECT 1 FROM teachers t
                       JOIN users u ON u.user_id = t.user_id
                       WHERE t.teacher_id = class_rooms.teacher_id
                         AND u.is_live_active = 0
                     ) THEN teacher_id
                     ELSE ?
                   END,
                   team_id = COALESCE(?, team_id),
                   updated_at = CURRENT_TIMESTAMP
             WHERE class_room_id = ? RETURNING class_room_id`
          )
          .bind(
            input.classCode,
            input.className,
            // D1は番号付きプレースホルダを使えないため、CASEのWHENとELSEへ同じ値を2回渡す
            input.teacherId,
            input.teacherId,
            input.teamId ?? null,
            id
          )
          .first<{ class_room_id: number }>();
      } catch (error) {
        throw unwrapDatabaseError(error);
      }
      if (!row) return null;
      return findOne(eq(class_rooms.id, row.class_room_id));
    },

    async updateAndCleanupTeam(
      id: number,
      input: ClassRoomInput,
      previousTeamId: number
    ): Promise<ClassRoomEntity | null> {
      let updateResult;
      try {
        [updateResult] = await db.batch<{ class_room_id: number }>([
          db
            .prepare(
              `UPDATE class_rooms
                 SET class_code = ?,
                     class_name = ?,
                     teacher_id = CASE
                       WHEN ? IS NULL AND EXISTS (
                         SELECT 1 FROM teachers t
                         JOIN users u ON u.user_id = t.user_id
                         WHERE t.teacher_id = class_rooms.teacher_id
                           AND u.is_live_active = 0
                       ) THEN teacher_id
                       ELSE ?
                     END,
                     team_id = COALESCE(?, team_id),
                     updated_at = CURRENT_TIMESTAMP
               WHERE class_room_id = ? RETURNING class_room_id`
            )
            .bind(
              input.classCode,
              input.className,
              input.teacherId,
              input.teacherId,
              input.teamId ?? null,
              id
            ),
          ...buildCleanupEmptyTeamStatements(db, previousTeamId),
        ]);
      } catch (error) {
        throw unwrapDatabaseError(error);
      }
      const row = updateResult.results[0] as
        | { class_room_id: number }
        | undefined;
      return row ? findOne(eq(class_rooms.id, row.class_room_id)) : null;
    },

    async delete(id) {
      const result = await orm
        .delete(class_rooms)
        .where(eq(class_rooms.id, id))
        .run();
      return result.meta.changes > 0;
    },

    async deleteAndCleanupTeam(id: number, teamId: number): Promise<boolean> {
      const [deleteResult] = await db.batch<unknown>([
        db.prepare('DELETE FROM class_rooms WHERE class_room_id = ?').bind(id),
        ...buildCleanupEmptyTeamStatements(db, teamId),
      ]);
      return (deleteResult.meta?.changes ?? 0) > 0;
    },

    async teacherExists(id: number): Promise<boolean> {
      const row = await db
        .prepare('SELECT teacher_id FROM teachers WHERE teacher_id = ?')
        .bind(id)
        .first();
      return row !== null;
    },

    async existsWithTeamId(
      teamId: number,
      excludeClassRoomId?: number
    ): Promise<boolean> {
      const row = await db
        .prepare(
          `SELECT 1 AS referenced FROM class_rooms
           WHERE team_id = ? AND class_room_id != ?
           LIMIT 1`
        )
        .bind(teamId, excludeClassRoomId ?? -1)
        .first();
      return row !== null;
    },

    async hasStudents(id) {
      return Boolean(
        await orm
          .select({ id: students.id })
          .from(students)
          .where(eq(students.classRoomId, id))
          .limit(1)
          .get()
      );
    },
  };
}

async function deleteClassRoomsAndTeamsByInputs(
  db: D1Database,
  inputs: Omit<ClassRoomInput, 'teamId'>[]
) {
  const classCodes = inputs.map(input => input.classCode);
  const teamNames = inputs.map(provisionalTeamName);

  for (const chunk of chunkArray(classCodes, D1_MAX_BOUND_PARAMETERS)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM class_rooms WHERE class_code IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
  for (const chunk of chunkArray(teamNames, D1_MAX_BOUND_PARAMETERS)) {
    const placeholders = chunk.map(() => '?').join(', ');
    await db
      .prepare(`DELETE FROM teams WHERE team_name IN (${placeholders})`)
      .bind(...chunk)
      .run();
  }
}
