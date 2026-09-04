import { Context } from 'hono';
import { z } from 'zod';
import { ITeacherService } from '../../application/services/ITeacherService';
import { TeacherSearchFilter } from '../../domain/entities/Teacher';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';

const MAX_LIMIT = 100;

const integerQuery = (minimum: number) =>
  z.preprocess(
    value =>
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
    z.number().int().min(minimum)
  );

const teacherListQuerySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    classRoomId: integerQuery(1).optional(),
    isStaff: z.enum(['true', 'false', 'all']).default('all'),
    isLiveActive: z.enum(['true', 'false', 'all']).default('all'),
    sortBy: z
      .enum(['teacherId', 'displayName', 'classCode', 'className'])
      .default('teacherId'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    limit: integerQuery(1)
      .refine(value => value <= MAX_LIMIT, {
        message: 'limit must be between 1 and 100',
      })
      .default(50),
    offset: integerQuery(0).default(0),
  })
  .strict()
  .transform(({ isStaff, isLiveActive, ...query }) => ({
    ...query,
    ...(isStaff === 'all' ? {} : { isStaff: isStaff === 'true' }),
    ...(isLiveActive === 'all'
      ? {}
      : { isLiveActive: isLiveActive === 'true' }),
  }));

const createTeacherSchema = z
  .object({
    userName: z.string().min(1),
    classRoomIds: z
      .array(z.number().int().positive())
      .refine(ids => new Set(ids).size === ids.length, {
        message: 'classRoomIds must not contain duplicate values',
      }),
  })
  .strict();

const updateTeacherSchema = z
  .object({
    userName: z.string().min(1),
    classRoomIds: z
      .array(z.number().int().positive())
      .refine(ids => new Set(ids).size === ids.length, {
        message: 'classRoomIds must not contain duplicate values',
      }),
  })
  .strict();

function getTeacherId(c: Context): number | null {
  const id = Number(c.req.param('teacherId') || c.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseSearchFilter(c: Context): TeacherSearchFilter {
  const parsed = teacherListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw new Error('Invalid teacher list query');
  }
  return parsed.data;
}

export function createTeacherController(teacherService: ITeacherService) {
  const createTeacher = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createTeacherSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_TEACHER_CREATE_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const teacher = await teacherService.createTeacher(parsedBody.data);
      return c.json(teacher, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class room not found') {
        return errorResponse(c, UserErrors.CLASS_ROOM_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.TEACHER_CREATE_FAILED);
    }
  };

  const getTeacherById = async (c: Context) => {
    try {
      const teacherId = getTeacherId(c);

      if (teacherId === null) {
        return errorResponse(c, UserErrors.INVALID_TEACHER_ID);
      }

      const teacher = await teacherService.getTeacherById(teacherId);
      return c.json(teacher, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return errorResponse(c, UserErrors.TEACHER_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.TEACHER_FETCH_FAILED);
    }
  };

  const getAllTeachers = async (c: Context) => {
    try {
      const filter = parseSearchFilter(c);
      const teachers = await teacherService.getAllTeachers(filter);
      return c.json(teachers, 200);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Invalid teacher list query'
      ) {
        return errorResponse(c, UserErrors.INVALID_TEACHER_LIST_QUERY);
      }
      return errorResponse(c, UserErrors.TEACHER_LIST_FAILED);
    }
  };

  const updateTeacher = async (c: Context) => {
    const teacherId = getTeacherId(c);
    if (teacherId === null) {
      return errorResponse(c, UserErrors.INVALID_TEACHER_ID);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = updateTeacherSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_TEACHER_UPDATE_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const teacher = await teacherService.updateTeacher(
        teacherId,
        parsedBody.data
      );
      return c.json(teacher, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return errorResponse(c, UserErrors.TEACHER_NOT_FOUND);
      }
      if (error instanceof Error && error.message === 'Class room not found') {
        return errorResponse(c, UserErrors.CLASS_ROOM_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.TEACHER_UPDATE_FAILED);
    }
  };

  const deleteTeacher = async (c: Context) => {
    const teacherId = getTeacherId(c);
    if (teacherId === null) {
      return errorResponse(c, UserErrors.INVALID_TEACHER_ID);
    }

    try {
      await teacherService.deleteTeacher(teacherId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return errorResponse(c, UserErrors.TEACHER_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.TEACHER_DELETE_FAILED);
    }
  };

  return {
    createTeacher,
    getTeacherById,
    getAllTeachers,
    updateTeacher,
    deleteTeacher,
  };
}
