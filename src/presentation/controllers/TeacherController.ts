import { Context } from 'hono';
import { z } from 'zod';
import { ITeacherService } from '../../application/services/ITeacherService';

const teacherImportRowSchema = z.object({
  last_name: z.string().trim().min(1).max(100),
  first_name: z.string().trim().min(1).max(100),
});

const teacherImportSchema = z.object({
  rows: z.array(teacherImportRowSchema).min(1),
});

export function createTeacherController(teacherService: ITeacherService) {
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
    validateTeacherImport,
    commitTeacherImport,
  };
}
