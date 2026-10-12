import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from '../database/schema';
import { class_rooms, students, teachers, users } from '../database/schema';
import type {
  ClassRoomEntity,
  ClassRoomInput,
  ClassRoomPage,
  ClassRoomSearchFilter,
} from '../../domain/entities/ClassRoom';
import type { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { chunkArray } from './chunk';
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
  teacherId: number | null;
  teacherUserId: number | null;
  teacherDisplayName: string | null;
  updatedAt: string;
  lockVersion: number;
};

function toEntity(row: ClassRoomRow): ClassRoomEntity {
  return {
    classRoomId: row.classRoomId,
    classCode: row.classCode,
    className: row.className,
    studentCount: Number(row.studentCount),
    updatedAt: row.updatedAt,
    lockVersion: row.lockVersion,
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
        teacherId: teachers.id,
        teacherUserId: users.id,
        teacherDisplayName: users.userName,
        updatedAt: class_rooms.updatedAt,
        lockVersion: class_rooms.lockVersion,
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
        class_rooms.updatedAt,
        class_rooms.lockVersion,
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
        teacherId: teachers.id,
        teacherUserId: users.id,
        teacherDisplayName: users.userName,
        updatedAt: class_rooms.updatedAt,
        lockVersion: class_rooms.lockVersion,
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
          class_rooms.updatedAt,
          class_rooms.lockVersion,
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
    async create(input: ClassRoomInput) {
      let row;
      try {
        const insertStatement = orm
          .insert(class_rooms)
          .values({
            classCode: input.classCode,
            name: input.className,
            teacherId: input.teacherId,
          })
          .returning({ id: class_rooms.id });
        // 担任付きで作成すると、その教員の担当クラスが増える。教員の版番号も同じ
        // batch で進め、取得済みの古い担当クラスのPUTが、増えた担当を外さないようにする。
        if (input.teacherId === null) {
          row = await insertStatement.get();
        } else {
          const [inserted] = await orm.batch([
            insertStatement,
            orm
              .update(teachers)
              .set({
                updatedAt: sql`CURRENT_TIMESTAMP`,
                lockVersion: sql`${teachers.lockVersion} + 1`,
              })
              .where(eq(teachers.id, input.teacherId)),
          ]);
          row = inserted[0];
        }
      } catch (error) {
        throw unwrapDatabaseError(error);
      }
      if (!row) throw new Error('Failed to create class');
      const created = await findOne(eq(class_rooms.id, row.id));
      if (!created) throw new Error('Failed to fetch created class');
      return created;
    },
    async createMany(inputs) {
      const statements = chunkArray(
        inputs,
        Math.floor(D1_MAX_BOUND_PARAMETERS / 3)
      )
        .map(chunk => {
          const placeholders = chunk.map(() => '(?, ?, ?)').join(', ');
          const values = chunk.flatMap(input => [
            input.classCode,
            input.className,
            input.teacherId,
          ]);
          const insertStatement = db
            .prepare(
              `INSERT INTO class_rooms (class_code, class_name, teacher_id) VALUES ${placeholders}`
            )
            .bind(...values);
          // 担任に指定された教員の担当クラスが増えるため、その教員の版番号も進める
          const teacherIds = Array.from(
            new Set(
              chunk
                .map(input => input.teacherId)
                .filter((teacherId): teacherId is number => teacherId !== null)
            )
          );
          if (teacherIds.length === 0) return [insertStatement];
          return [
            insertStatement,
            db
              .prepare(
                `UPDATE teachers
                 SET lock_version = lock_version + 1,
                     updated_at = CURRENT_TIMESTAMP
               WHERE teacher_id IN (${teacherIds.map(() => '?').join(', ')})`
              )
              .bind(...teacherIds),
          ];
        })
        .flat();
      if (statements.length > 0) await db.batch(statements);
    },
    async update(id, input) {
      // 無効化された教員は担任として返していないため、呼び出し側が受け取った
      // 教室にはそもそも担任が乗っていない。それをそのまま送り返してくる
      // teacherId = null を「担任を外す」と解釈すると、表示から隠しただけの
      // 割り当てまで消えてしまう。担任が停止中のときの null は据え置きとして扱う。
      //
      // 版番号(expectedLockVersion)が指定された場合は、取得時点から教室が変更
      // されていないこともWHEREで確認する。GETとPUTの間に別操作が挟まっていれば
      // 0件更新になり、呼び出し側がnullとして受け取る。版番号は更新のたびに必ず
      // 1ずつ増えるため、updated_at（秒単位）では区別できない同じ秒内の更新も検出できる。
      //
      // 担任の稼働状態が変わったときは、担任クラスの版番号も進む
      // （UserStatusRepository.updateLiveActive）。そのため、版番号を指定していれば、
      // 取得後に再有効化された担任を、null が送られてきたまま消すことはない。
      //
      // 版番号を指定しない呼び出しでは、この確認は行われない。据え置きの判定は
      // UPDATE実行時点のDBの状態を見るため、GETとPUTの間に担任が再有効化されると、
      // GET時点でnullだった値がそのまま送られて割り当てを消してしまう。
      // 担任が実際に変わる更新では、旧・新の担任の版番号も進める。教員の更新(PUT)は
      // 担当クラスを全置換するため、教室側から担当が変わったことを教員の版で
      // 検出できるようにする。教室の版番号の条件が合うとき（＝この更新が実際に
      // 行われるとき）だけ進め、先に置く（更新後は旧担任が分からなくなる）。
      // 「変わる」の判定は、停止中の担任の据え置き（teacher_id の CASE）と同じ式にする。
      const effectiveTeacherId = `CASE
                     WHEN ? IS NULL AND EXISTS (
                       SELECT 1 FROM teachers t
                       JOIN users u ON u.user_id = t.user_id
                       WHERE t.teacher_id = %s.teacher_id
                         AND u.is_live_active = 0
                     ) THEN %s.teacher_id
                     ELSE ?
                   END`;
      let row;
      try {
        const [, updateResult] = await db.batch<{ class_room_id: number }>([
          db
            .prepare(
              `UPDATE teachers
                 SET lock_version = lock_version + 1,
                     updated_at = CURRENT_TIMESTAMP
               WHERE teacher_id IN (
                 SELECT teacher_id FROM class_rooms WHERE class_room_id = ?
                 UNION SELECT ?
               )
                 AND EXISTS (
                   SELECT 1 FROM class_rooms c
                   WHERE c.class_room_id = ?
                     AND (? IS NULL OR c.lock_version = ?)
                     AND c.teacher_id IS NOT (${effectiveTeacherId.replaceAll('%s', 'c')})
                 )`
            )
            .bind(
              id,
              input.teacherId,
              id,
              input.expectedLockVersion ?? null,
              input.expectedLockVersion ?? null,
              input.teacherId,
              input.teacherId
            ),
          db
            .prepare(
              `UPDATE class_rooms
               SET class_code = ?,
                   class_name = ?,
                   teacher_id = ${effectiveTeacherId.replaceAll('%s', 'class_rooms')},
                   updated_at = CURRENT_TIMESTAMP,
                   lock_version = lock_version + 1
             WHERE class_room_id = ?
               AND (? IS NULL OR lock_version = ?)
             RETURNING class_room_id`
            )
            .bind(
              input.classCode,
              input.className,
              // D1は番号付きプレースホルダを使えないため、CASEのWHENとELSEへ同じ値を2回渡す
              input.teacherId,
              input.teacherId,
              id,
              // 版番号の条件も同じ理由で2回渡す
              input.expectedLockVersion ?? null,
              input.expectedLockVersion ?? null
            ),
        ]);
        row = updateResult.results[0];
      } catch (error) {
        throw unwrapDatabaseError(error);
      }
      if (!row) return null;
      return findOne(eq(class_rooms.id, row.class_room_id));
    },
    async delete(id) {
      const result = await orm
        .delete(class_rooms)
        .where(eq(class_rooms.id, id))
        .run();
      return result.meta.changes > 0;
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
