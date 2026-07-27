import type { Context } from 'hono';
import { z } from 'zod';
import type { IClassRoomService } from '../../application/services/IClassRoomService';

const classIdSchema = z.coerce.number().int().positive();
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
const classRoomRequestSchema = z.object({
  classCode: z.string().trim().min(1),
  className: z.string().trim().min(1),
  teacherId: z.number().int().positive().nullable(),
});

const classRoomImportRowSchema = z.object({
  class_code: z.string().trim().min(1).max(100),
  class_name: z.string().trim().min(1).max(100),
});

const classRoomImportSchema = z.object({
  rows: z.array(classRoomImportRowSchema).min(1),
});

export function createClassRoomController(classService: IClassRoomService) {
  const getAllClassrooms = async (c: Context) => {
    const query = paginationSchema.safeParse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!query.success) {
      return c.json(
        { error: 'Invalid class list query', details: query.error.flatten() },
        400
      );
    }
    try {
      return c.json(
        await classService.getAllClassrooms(query.data.limit, query.data.offset)
      );
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch classrooms',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const getClassroomById = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return c.json({ error: 'Invalid class ID' }, 400);
    try {
      return c.json(await classService.getClassroomById(id.data));
    } catch (error) {
      if (error instanceof Error && error.message === 'Class not found') {
        return c.json({ error: error.message }, 404);
      }
      return c.json({ error: 'Failed to fetch class' }, 500);
    }
  };

  const parseBody = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    return classRoomRequestSchema.safeParse(body);
  };

  const createClassroom = async (c: Context) => {
    const body = await parseBody(c);
    if (!body.success) {
      return c.json(
        { error: 'Invalid class request body', details: body.error.flatten() },
        400
      );
    }
    try {
      return c.json(
        await classService.createClassroom({
          class_code: body.data.classCode,
          class_name: body.data.className,
          teacher_id: body.data.teacherId,
        }),
        201
      );
    } catch (error) {
      return handleWriteError(c, error, 'Failed to create class');
    }
  };

  const updateClassroom = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return c.json({ error: 'Invalid class ID' }, 400);
    const body = await parseBody(c);
    if (!body.success) {
      return c.json(
        { error: 'Invalid class request body', details: body.error.flatten() },
        400
      );
    }
    try {
      return c.json(
        await classService.updateClassroom(id.data, {
          class_code: body.data.classCode,
          class_name: body.data.className,
          teacher_id: body.data.teacherId,
        })
      );
    } catch (error) {
      return handleWriteError(c, error, 'Failed to update class');
    }
  };

  const deleteClassroom = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return c.json({ error: 'Invalid class ID' }, 400);
    try {
      await classService.deleteClassroom(id.data);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class not found') {
        return c.json({ error: error.message }, 404);
      }
      if (
        error instanceof Error &&
        error.message === 'Class is referenced by students'
      ) {
        return c.json({ error: error.message }, 409);
      }
      return c.json({ error: 'Failed to delete class' }, 500);
    }
  };

  const parseClassRoomImportBody = (c: Context) =>
    c.req
      .json()
      .catch(() => undefined)
      .then(body => classRoomImportSchema.safeParse(body));

  const validateClassRoomImport = async (c: Context) => {
    const parsedBody = await parseClassRoomImportBody(c);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid class room import request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const result = await classService.validateClassRoomImport(
        parsedBody.data
      );
      return c.json(result, 200);
    } catch {
      return c.json({ error: 'Failed to validate class room import' }, 500);
    }
  };

  const commitClassRoomImport = async (c: Context) => {
    const parsedBody = await parseClassRoomImportBody(c);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid class room import request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const result = await classService.commitClassRoomImport(parsedBody.data);
      if (result.error_count > 0) {
        return c.json(result, 422);
      }
      return c.json(result, 201);
    } catch {
      return c.json({ error: 'Failed to commit class room import' }, 500);
    }
  };

  return {
    getAllClassrooms,
    getClassroomById,
    createClassroom,
    updateClassroom,
    deleteClassroom,
    validateClassRoomImport,
    commitClassRoomImport,
  };
}

function handleWriteError(c: Context, error: unknown, fallback: string) {
  if (error instanceof Error && error.message === 'Teacher not found') {
    return c.json({ error: error.message }, 404);
  }
  if (error instanceof Error && error.message === 'Class not found') {
    return c.json({ error: error.message }, 404);
  }
  if (error instanceof Error && error.message === 'Class code already exists') {
    return c.json({ error: error.message }, 409);
  }
  return c.json(
    {
      error: fallback,
      details: error instanceof Error ? error.message : String(error),
    },
    500
  );
}
