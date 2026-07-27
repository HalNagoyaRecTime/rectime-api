import { Context } from 'hono';
import { z } from 'zod';
import { ITeacherService } from '../../application/services/ITeacherService';
import { TeacherSearchFilter } from '../../domain/entities/Teacher';

const updateTeacherSchema = z.object({
  userName: z.string().min(1),
  isLiveActive: z.boolean(),
  classRoomIds: z
    .array(z.number().int().positive())
    .refine(ids => new Set(ids).size === ids.length, {
      message: 'classRoomIds must not contain duplicate values',
    }),
});

const teacherImportRowSchema = z.object({
  last_name: z.string().trim().min(1).max(100),
  first_name: z.string().trim().min(1).max(100),
});

const teacherImportSchema = z.object({
  rows: z.array(teacherImportRowSchema).min(1),
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

  const classRoomId = c.req.query('classRoomId');
  if (classRoomId !== undefined) {
    const parsed = Number(classRoomId);
    if (Number.isInteger(parsed) && parsed > 0) filter.classRoomId = parsed;
  }

  const isLiveActive = c.req.query('isLiveActive');
  if (isLiveActive === 'true') filter.isLiveActive = true;
  else if (isLiveActive === 'false') filter.isLiveActive = false;

  const page = c.req.query('page');
  if (page !== undefined) {
    const parsed = Number(page);
    if (Number.isInteger(parsed) && parsed > 0) filter.page = parsed;
  }

  const limit = c.req.query('limit');
  if (limit !== undefined) {
    const parsed = Number(limit);
    if (Number.isInteger(parsed) && parsed > 0) filter.limit = parsed;
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

  const parseTeacherImportBody = (c: Context) =>
    c.req
      .json()
      .catch(() => undefined)
      .then(body => teacherImportSchema.safeParse(body));

  const validateTeacherImport = async (c: Context) => {
    const parsedBody = await parseTeacherImportBody(c);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid teacher import request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const result = await teacherService.validateTeacherImport(
        parsedBody.data
      );
      return c.json(result, 200);
    } catch {
      return c.json({ error: 'Failed to validate teacher import' }, 500);
    }
  };

  const commitTeacherImport = async (c: Context) => {
    const parsedBody = await parseTeacherImportBody(c);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid teacher import request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const result = await teacherService.commitTeacherImport(parsedBody.data);
      if (result.error_count > 0) {
        return c.json(result, 422);
      }
      return c.json(result, 201);
    } catch {
      return c.json({ error: 'Failed to commit teacher import' }, 500);
    }
  };

  return {
    getTeacherById,
    getAllTeachers,
    updateTeacher,
    deleteTeacher,
    validateTeacherImport,
    commitTeacherImport,
  };
}
