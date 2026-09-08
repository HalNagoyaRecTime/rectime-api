import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
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

const DEFAULT_LIMIT = 50;
const D1_MAX_BOUND_PARAMETERS = 100;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}

type ClassRoomRow = {
  classRoomId: number;
  classCode: string;
  className: string;
  studentCount: number;
  teacherId: number | null;
  teacherUserId: number | null;
  teacherDisplayName: string | null;
};

function toEntity(row: ClassRoomRow): ClassRoomEntity {
  return {
    classRoomId: row.classRoomId,
    classCode: row.classCode,
    className: row.className,
    studentCount: Number(row.studentCount),
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

  const findPage = async (
    filter: ClassRoomSearchFilter = {},
    id?: number
  ): Promise<ClassRoomPage> => {
    const limit =
      filter.limit && filter.limit > 0
        ? Math.min(filter.limit, 100)
        : DEFAULT_LIMIT;
    const offset =
      filter.offset !== undefined && filter.offset >= 0 ? filter.offset : 0;
    const conditions = [];
    if (id !== undefined) conditions.push(eq(class_rooms.id, id));
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

    const base = orm
      .select({
        classRoomId: class_rooms.id,
        classCode: class_rooms.classCode,
        className: class_rooms.name,
        studentCount: sql<number>`count(${students.id})`,
        teacherId: teachers.id,
        teacherUserId: users.id,
        teacherDisplayName: users.userName,
      })
      .from(class_rooms)
      .leftJoin(teachers, eq(teachers.id, class_rooms.teacherId))
      .leftJoin(users, eq(users.id, teachers.userId))
      .leftJoin(students, eq(students.classRoomId, class_rooms.id));
    const countBase = orm
      .select({ total: sql<number>`count(distinct ${class_rooms.id})` })
      .from(class_rooms)
      .leftJoin(teachers, eq(teachers.id, class_rooms.teacherId))
      .leftJoin(users, eq(users.id, teachers.userId));

    const totalRow = await (
      whereClause ? countBase.where(whereClause) : countBase
    ).get();
    const total = Number(totalRow?.total ?? 0);
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
    const rows = await (whereClause ? base.where(whereClause) : base)
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
          ? [sql<number>`CASE WHEN ${users.userName} IS NULL THEN 1 ELSE 0 END`]
          : []),
        order(sortColumn),
        asc(class_rooms.id)
      )
      .limit(limit)
      .offset(offset)
      .all();

    const items = rows.map(toEntity);
    return { items, total, limit, offset };
  };

  return {
    async findAll(filter: ClassRoomSearchFilter = {}) {
      return findPage(filter);
    },
    async findById(id) {
      const page = await findPage({ limit: 1 }, id);
      return page.items[0] ?? null;
    },
    async findByCode(classCode) {
      const row = await orm
        .select({ id: class_rooms.id })
        .from(class_rooms)
        .where(eq(class_rooms.classCode, classCode))
        .get();
      return row ? this.findById(row.id) : null;
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
        row = await orm
          .insert(class_rooms)
          .values({
            classCode: input.classCode,
            name: input.className,
            teacherId: input.teacherId,
          })
          .returning({ id: class_rooms.id })
          .get();
      } catch (error) {
        if (error instanceof Error && error.cause instanceof Error)
          throw error.cause;
        throw error;
      }
      if (!row) throw new Error('Failed to create class');
      const created = await findPage({ limit: 1 }, row.id);
      if (!created.items[0]) throw new Error('Failed to fetch created class');
      return created.items[0];
    },
    async createMany(inputs) {
      const statements = chunkArray(
        inputs,
        Math.floor(D1_MAX_BOUND_PARAMETERS / 3)
      ).map(chunk => {
        const placeholders = chunk.map(() => '(?, ?, ?)').join(', ');
        const values = chunk.flatMap(input => [
          input.classCode,
          input.className,
          input.teacherId,
        ]);
        return db
          .prepare(
            `INSERT INTO class_rooms (class_code, class_name, teacher_id) VALUES ${placeholders}`
          )
          .bind(...values);
      });
      if (statements.length > 0) await db.batch(statements);
    },
    async update(id, input) {
      const row = await orm
        .update(class_rooms)
        .set({
          classCode: input.classCode,
          name: input.className,
          teacherId: input.teacherId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(class_rooms.id, id))
        .returning({ id: class_rooms.id })
        .get();
      if (!row) return null;
      const updated = await findPage({ limit: 1 }, row.id);
      return updated.items[0] ?? null;
    },
    async delete(id) {
      const result = await orm
        .delete(class_rooms)
        .where(eq(class_rooms.id, id))
        .run();
      return result.meta.changes > 0;
    },
    async teacherExists(id) {
      return Boolean(
        await orm
          .select({ id: teachers.id })
          .from(teachers)
          .where(eq(teachers.id, id))
          .get()
      );
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
