import { Context } from 'hono';
import { z } from 'zod';
import { IClassRoomService } from '../../application/services/IClassRoomService';

const classRoomImportRowSchema = z.object({
  class_code: z.string().trim().min(1).max(100),
  class_name: z.string().trim().min(1).max(100),
});

const classRoomImportSchema = z.object({
  rows: z.array(classRoomImportRowSchema).min(1),
});

export function createClassRoomController(classService: IClassRoomService) {
  const getAllClassRooms = async (c: Context) => {
    try {
      const classRooms = await classService.getAllClassRooms();
      return c.json(classRooms);
    } catch (error) {
      console.error('Error fetching class rooms:', error);
      return c.json({ error: 'Failed to fetch class rooms' }, 500);
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
    getAllClassRooms,
    validateClassRoomImport,
    commitClassRoomImport,
  };
}
