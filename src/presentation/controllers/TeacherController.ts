import { Context } from 'hono';
import { z } from 'zod';
import { ITeacherService } from '../../application/services/ITeacherService';
import { TeacherSearchFilter } from '../../domain/entities/Teacher';

const MAX_LIMIT = 100;

const updateTeacherSchema = z.object({
  userName: z.string().min(1),
  classRoomIds: z
    .array(z.number().int().positive())
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'classRoomIds must not contain duplicate values',
    }),
});

const createTeacherSchema = z.object({
  userName: z.string().min(1),
  classRoomIds: z
    .array(z.number().int().positive())
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'classRoomIds must not contain duplicate values',
    }),
});

function getTeacherId(c: Context): number | null {
  const id = Number(c.req.param('teacherId') || c.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseSearchFilter(c: Context): TeacherSearchFilter {
  const filter: TeacherSearchFilter = {};

  const teacherId = c.req.query('teacherId');
  if (teacherId !== undefined) {
    const parsed = Number(teacherId);
    if (Number.isInteger(parsed) && parsed > 0) filter.teacherId = parsed;
  }

  const userName = c.req.query('userName');
  if (userName) filter.userName = userName;

  const search = c.req.query('search');
  if (search?.trim()) filter.search = search.trim();

  const sortBy = c.req.query('sortBy');
  if (sortBy === 'teacherId' || sortBy === 'displayName') {
    filter.sortBy = sortBy;
  }

  const sortOrder = c.req.query('sortOrder');
  if (sortOrder === 'asc' || sortOrder === 'desc') {
    filter.sortOrder = sortOrder;
  }

  const classRoomId = c.req.query('classRoomId');
  if (classRoomId !== undefined) {
    const parsed = Number(classRoomId);
    if (Number.isInteger(parsed) && parsed > 0) filter.classRoomId = parsed;
  }

  const isLiveActive = c.req.query('isLiveActive');
  if (isLiveActive === 'true') filter.isLiveActive = true;
  else if (isLiveActive === 'false') filter.isLiveActive = false;

  const offset = c.req.query('offset');
  if (offset !== undefined) {
    const parsed = Number(offset);
    if (Number.isInteger(parsed) && parsed >= 0) filter.offset = parsed;
  }

  const limit = c.req.query('limit');
  if (limit !== undefined) {
    const parsed = Number(limit);
    if (Number.isInteger(parsed) && parsed > 0) {
      filter.limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  return filter;
}

export function createTeacherController(teacherService: ITeacherService) {
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
    } catch {
      return c.json({ error: 'Failed to fetch teachers' }, 500);
    }
  };

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
    getTeacherById,
    getAllTeachers,
    createTeacher,
    updateTeacher,
    deleteTeacher,
  };
}
