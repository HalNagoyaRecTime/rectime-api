import type { Context } from 'hono';
import { z } from 'zod';
import type { IClassService } from '../../application/services/IClassService';

const classIdSchema = z.coerce.number().int().positive();
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const classRequestSchema = z.object({
  classCode: z.string().trim().min(1),
  className: z.string().trim().min(1),
  teacherId: z.number().int().positive().nullable(),
});

export function createClassController(classService: IClassService) {
  const getAllClasses = async (c: Context) => {
    const query = paginationSchema.safeParse({
      page: c.req.query('page'),
      limit: c.req.query('limit'),
    });
    if (!query.success) {
      return c.json(
        { error: 'Invalid class list query', details: query.error.flatten() },
        400
      );
    }
    try {
      return c.json(
        await classService.getAllClasses(query.data.page, query.data.limit)
      );
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch classes',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const getClassById = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return c.json({ error: 'Invalid class ID' }, 400);
    try {
      return c.json(await classService.getClassById(id.data));
    } catch (error) {
      if (error instanceof Error && error.message === 'Class not found')
        return c.json({ error: error.message }, 404);
      return c.json({ error: 'Failed to fetch class' }, 500);
    }
  };

  const parseBody = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    return classRequestSchema.safeParse(body);
  };

  const createClass = async (c: Context) => {
    const body = await parseBody(c);
    if (!body.success)
      return c.json(
        { error: 'Invalid class request body', details: body.error.flatten() },
        400
      );
    try {
      return c.json(
        await classService.createClass({
          class_code: body.data.classCode,
          name: body.data.className,
          teacher_id: body.data.teacherId,
        }),
        201
      );
    } catch (error) {
      return handleWriteError(c, error, 'Failed to create class');
    }
  };

  const updateClass = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return c.json({ error: 'Invalid class ID' }, 400);
    const body = await parseBody(c);
    if (!body.success)
      return c.json(
        { error: 'Invalid class request body', details: body.error.flatten() },
        400
      );
    try {
      return c.json(
        await classService.updateClass(id.data, {
          class_code: body.data.classCode,
          name: body.data.className,
          teacher_id: body.data.teacherId,
        })
      );
    } catch (error) {
      return handleWriteError(c, error, 'Failed to update class');
    }
  };

  const deleteClass = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return c.json({ error: 'Invalid class ID' }, 400);
    try {
      await classService.deleteClass(id.data);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class not found')
        return c.json({ error: error.message }, 404);
      if (
        error instanceof Error &&
        error.message === 'Class is referenced by students'
      )
        return c.json({ error: error.message }, 409);
      return c.json({ error: 'Failed to delete class' }, 500);
    }
  };

  return { getAllClasses, getClassById, createClass, updateClass, deleteClass };
}

function handleWriteError(c: Context, error: unknown, fallback: string) {
  if (error instanceof Error && error.message === 'Teacher not found')
    return c.json({ error: error.message }, 404);
  if (error instanceof Error && error.message === 'Class not found')
    return c.json({ error: error.message }, 404);
  if (error instanceof Error && error.message === 'Class code already exists')
    return c.json({ error: error.message }, 409);
  return c.json(
    {
      error: fallback,
      details: error instanceof Error ? error.message : String(error),
    },
    500
  );
}
