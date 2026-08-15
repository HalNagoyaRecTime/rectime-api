import { Context } from 'hono';
import { z } from 'zod';
import { ITeacherService } from '../../application/services/ITeacherService';
import { TeacherSearchFilter } from '../../domain/entities/Teacher';

const MAX_LIMIT = 100;

const integerQuery = (minimum: number) =>
  z.preprocess(
    value =>
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
    z.number().int().min(minimum)
  );

const teacherListQuerySchema = z
  .object({
    teacherId: integerQuery(1).optional(),
    userName: z.string().trim().min(1).optional(),
    classRoomId: integerQuery(1).optional(),
    isLiveActive: z
      .enum(['true', 'false'])
      .transform(value => value === 'true')
      .optional(),
    search: z.string().trim().min(1).optional(),
    sortBy: z.enum(['teacherId', 'displayName']).default('teacherId'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    limit: integerQuery(1)
      .refine(value => value <= MAX_LIMIT, {
        message: 'limit must be between 1 and 100',
      })
      .default(50),
    offset: integerQuery(0).default(0),
  })
  .strict();

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
    isLiveActive: z.boolean(),
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
      return c.json(
        {
          error: 'Invalid teacher create request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const teacher = await teacherService.createTeacher(parsedBody.data);
      return c.json(teacher, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class room not found') {
        return c.json({ error: error.message }, 400);
      }
      return c.json(
        {
          error: 'Failed to create teacher',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const getTeacherById = async (c: Context) => {
    try {
      const teacherId = getTeacherId(c);

      if (teacherId === null) {
        return c.json({ error: 'Invalid teacher ID' }, 400);
      }

      const teacher = await teacherService.getTeacherById(teacherId);
      return c.json(teacher);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return c.json({ error: 'Teacher not found' }, 404);
      }
      return c.json({ error: 'Failed to fetch teacher' }, 500);
    }
  };

  const getAllTeachers = async (c: Context) => {
    try {
      const filter = parseSearchFilter(c);
      const teachers = await teacherService.getAllTeachers(filter);
      return c.json(teachers);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Invalid teacher list query'
      ) {
        return c.json({ error: 'Invalid teacher list query' }, 400);
      }
      return c.json({ error: 'Failed to fetch teachers' }, 500);
    }
  };

  const updateTeacher = async (c: Context) => {
    const teacherId = getTeacherId(c);
    if (teacherId === null) {
      return c.json({ error: 'Invalid teacher ID' }, 400);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = updateTeacherSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid teacher update request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const teacher = await teacherService.updateTeacher(
        teacherId,
        parsedBody.data
      );
      return c.json(teacher);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof Error && error.message === 'Class room not found') {
        return c.json({ error: error.message }, 400);
      }
      return c.json(
        {
          error: 'Failed to update teacher',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const deleteTeacher = async (c: Context) => {
    const teacherId = getTeacherId(c);
    if (teacherId === null) {
      return c.json({ error: 'Invalid teacher ID' }, 400);
    }

    try {
      await teacherService.deleteTeacher(teacherId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return c.json({ error: error.message }, 404);
      }
      if (
        error instanceof Error &&
        error.message === 'Teacher is referenced by other data'
      ) {
        return c.json({ error: error.message }, 409);
      }
      return c.json(
        {
          error: 'Failed to delete teacher',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
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
