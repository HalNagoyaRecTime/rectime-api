import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq, inArray, like, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { TeacherEntity } from '../../domain/entities/Teacher';
import type {
  ITeacherRepository,
  TeacherSearchParams,
  UpdateTeacherInput,
} from '../../domain/interfaces/repositories/ITeacherRepository';
import * as schema from '../database/schema';
import {
  class_rooms,
  events,
  firebase_tokens,
  gathering_group_members,
  microsoft_account_links,
  notification_schedules,
  staffs,
  students,
  teacher_class_rooms,
  teachers,
  users,
} from '../database/schema';

type TeacherRow = {
  teacher_id: number;
  user_id: number;
  user_name: string;
  is_live_active: number;
};

type TeacherClassRoomRow = {
  teacher_id: number;
  class_room_id: number;
  class_code: string;
  class_name: string;
};

function toEntity(
  row: TeacherRow,
  classRooms: TeacherClassRoomRow[]
): TeacherEntity {
  return {
    teacher_id: row.teacher_id,
    user_id: row.user_id,
    user_name: row.user_name,
    is_live_active: row.is_live_active,
    class_rooms: classRooms.map(classRoom => ({
      class_room_id: classRoom.class_room_id,
      class_code: classRoom.class_code,
      class_name: classRoom.class_name,
    })),
  };
}

export function createTeacherRepository(db: D1Database): ITeacherRepository {
  const orm = drizzle(db, { schema });

  const toWhereClause = (params: TeacherSearchParams): SQL | undefined => {
    const filters: SQL[] = [];

    if (params.teacherId !== undefined) {
      filters.push(eq(teachers.id, params.teacherId));
    }
    if (params.displayName) {
      filters.push(like(users.userName, `%${params.displayName}%`));
    }
    if (params.isLiveActive !== undefined) {
      filters.push(eq(users.isLiveActive, params.isLiveActive));
    }
    if (params.classRoomId !== undefined) {
      filters.push(
        inArray(
          teachers.id,
          orm
            .select({ teacher_id: teacher_class_rooms.teacherId })
            .from(teacher_class_rooms)
            .where(eq(teacher_class_rooms.classRoomId, params.classRoomId))
        )
      );
    }

    if (filters.length === 0) {
      return undefined;
    }

    return and(...filters);
  };

  const findClassRoomsByTeacherIds = async (
    teacherIds: number[]
  ): Promise<TeacherClassRoomRow[]> => {
    if (teacherIds.length === 0) {
      return [];
    }

    return orm
      .select({
        teacher_id: teacher_class_rooms.teacherId,
        class_room_id: class_rooms.id,
        class_code: class_rooms.classCode,
        class_name: class_rooms.name,
      })
      .from(teacher_class_rooms)
      .innerJoin(class_rooms, eq(teacher_class_rooms.classRoomId, class_rooms.id))
      .where(inArray(teacher_class_rooms.teacherId, teacherIds))
      .orderBy(asc(teacher_class_rooms.teacherId), asc(class_rooms.id))
      .all();
  };

  const findTeacherRowById = async (teacherId: number): Promise<TeacherRow | null> => {
    const row = await orm
      .select({
        teacher_id: teachers.id,
        user_id: users.id,
        user_name: users.userName,
        is_live_active: users.isLiveActive,
      })
      .from(teachers)
      .innerJoin(users, eq(teachers.userId, users.id))
      .where(eq(teachers.id, teacherId))
      .get();

    return row ?? null;
  };

  const hasReferences = async (userId: number): Promise<boolean> => {
    const checks = await Promise.all([
      orm
        .select({ id: students.id })
        .from(students)
        .where(eq(students.userId, userId))
        .get(),
      orm
        .select({ id: staffs.id })
        .from(staffs)
        .where(eq(staffs.userId, userId))
        .get(),
      orm
        .select({ id: events.id })
        .from(events)
        .where(eq(events.userId, userId))
        .get(),
      orm
        .select({ id: gathering_group_members.id })
        .from(gathering_group_members)
        .where(eq(gathering_group_members.userId, userId))
        .get(),
      orm
        .select({ id: firebase_tokens.firebaseTokenId })
        .from(firebase_tokens)
        .where(eq(firebase_tokens.userId, userId))
        .get(),
      orm
        .select({ id: microsoft_account_links.id })
        .from(microsoft_account_links)
        .where(eq(microsoft_account_links.userId, userId))
        .get(),
      orm
        .select({ id: notification_schedules.id })
        .from(notification_schedules)
        .where(eq(notification_schedules.userId, userId))
        .get(),
    ]);

    return checks.some(Boolean);
  };

  return {
    async findById(id) {
      const teacherRow = await findTeacherRowById(id);
      if (!teacherRow) {
        return null;
      }

      const classRoomRows = await findClassRoomsByTeacherIds([id]);
      return toEntity(teacherRow, classRoomRows);
    },

    async search(params) {
      const whereClause = toWhereClause(params);
      const offset = (params.page - 1) * params.perPage;

      const teacherRows = await orm
        .select({
          teacher_id: teachers.id,
          user_id: users.id,
          user_name: users.userName,
          is_live_active: users.isLiveActive,
        })
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(whereClause)
        .orderBy(asc(teachers.id))
        .limit(params.perPage)
        .offset(offset)
        .all();

      const totalRow = await orm
        .select({ count: sql<number>`count(*)` })
        .from(teachers)
        .innerJoin(users, eq(teachers.userId, users.id))
        .where(whereClause)
        .get();

      const teacherIds = teacherRows.map(row => row.teacher_id);
      const classRoomRows = await findClassRoomsByTeacherIds(teacherIds);
      const classRoomsByTeacherId = new Map<number, TeacherClassRoomRow[]>();
      for (const classRoomRow of classRoomRows) {
        const rows = classRoomsByTeacherId.get(classRoomRow.teacher_id) ?? [];
        rows.push(classRoomRow);
        classRoomsByTeacherId.set(classRoomRow.teacher_id, rows);
      }

      return {
        teachers: teacherRows.map(teacherRow =>
          toEntity(teacherRow, classRoomsByTeacherId.get(teacherRow.teacher_id) ?? [])
        ),
        total: Number(totalRow?.count ?? 0),
      };
    },

    async updateById(teacherId, input) {
      const teacherRow = await findTeacherRowById(teacherId);
      if (!teacherRow) {
        return null;
      }

      const updates: Record<string, string | number | SQL> = {};
      if (input.displayName !== undefined) {
        updates.userName = input.displayName;
      }
      if (input.isLiveActive !== undefined) {
        updates.isLiveActive = input.isLiveActive;
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = sql`CURRENT_TIMESTAMP`;
        await orm.update(users).set(updates).where(eq(users.id, teacherRow.user_id)).run();
      }

      if (input.classRoomIds !== undefined) {
        const uniqueClassRoomIds = [...new Set(input.classRoomIds)];
        if (uniqueClassRoomIds.length > 0) {
          const existingClassRooms = await orm
            .select({ id: class_rooms.id })
            .from(class_rooms)
            .where(inArray(class_rooms.id, uniqueClassRoomIds))
            .all();
          if (existingClassRooms.length !== uniqueClassRoomIds.length) {
            throw new Error('Class room not found');
          }
        }

        await orm
          .delete(teacher_class_rooms)
          .where(eq(teacher_class_rooms.teacherId, teacherId))
          .run();

        if (uniqueClassRoomIds.length > 0) {
          await orm
            .insert(teacher_class_rooms)
            .values(
              uniqueClassRoomIds.map(classRoomId => ({
                teacherId,
                classRoomId,
              }))
            )
            .run();
        }

        await orm
          .update(teachers)
          .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(teachers.id, teacherId))
          .run();
      }

      const updatedTeacher = await this.findById(teacherId);
      if (!updatedTeacher) {
        throw new Error('Teacher not found');
      }
      return updatedTeacher;
    },

    async deleteById(teacherId) {
      const teacherRow = await findTeacherRowById(teacherId);
      if (!teacherRow) {
        return false;
      }

      if (await hasReferences(teacherRow.user_id)) {
        throw new Error('Teacher is referenced');
      }

      await orm
        .delete(teacher_class_rooms)
        .where(eq(teacher_class_rooms.teacherId, teacherId))
        .run();
      await orm.delete(teachers).where(eq(teachers.id, teacherId)).run();
      await orm.delete(users).where(eq(users.id, teacherRow.user_id)).run();

      return true;
    },
  };
}
