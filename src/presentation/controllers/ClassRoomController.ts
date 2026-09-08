import type { Context } from 'hono';
import { z } from 'zod';
import type { IClassRoomService } from '../../application/services/IClassRoomService';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';
import { CommonErrors } from '../errors/commonErrors';

const classIdSchema = z.coerce.number().int().positive();
const paginationSchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    sortBy: z
      .enum([
        'classRoomId',
        'classCode',
        'className',
        'teacherName',
        'studentCount',
      ])
      .default('classRoomId'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
const classRoomRequestSchema = z
  .object({
    classCode: z.string().trim().min(1),
    className: z.string().trim().min(1),
    teacherId: z.number().int().positive().nullable(),
  })
  .strict();

export function createClassRoomController(classService: IClassRoomService) {
  const getAllClassrooms = async (c: Context) => {
    const query = paginationSchema.safeParse(c.req.query());
    if (!query.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        query.error.flatten()
      );
    }
    try {
      const result = await classService.getAllClassrooms(query.data);
      return c.json(
        {
          items: result.items,
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
        200
      );
    } catch {
      return errorResponse(c, UserErrors.CLASS_ROOM_LIST_FAILED);
    }
  };

  const getClassroomById = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return errorResponse(c, UserErrors.INVALID_CLASS_ID);
    try {
      return c.json(await classService.getClassroomById(id.data), 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class not found') {
        return errorResponse(c, UserErrors.CLASS_ROOM_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.CLASS_ROOM_FETCH_FAILED);
    }
  };

  const parseBody = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    return classRoomRequestSchema.safeParse(body);
  };

  const createClassroom = async (c: Context) => {
    const body = await parseBody(c);
    if (!body.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_CLASS_REQUEST,
        body.error.flatten()
      );
    }
    try {
      return c.json(await classService.createClassroom(body.data), 201);
    } catch (error) {
      return handleWriteError(c, error, UserErrors.CLASS_ROOM_CREATE_FAILED);
    }
  };

  const updateClassroom = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return errorResponse(c, UserErrors.INVALID_CLASS_ID);
    const body = await parseBody(c);
    if (!body.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_CLASS_REQUEST,
        body.error.flatten()
      );
    }
    try {
      return c.json(
        await classService.updateClassroom(id.data, body.data),
        200
      );
    } catch (error) {
      return handleWriteError(c, error, UserErrors.CLASS_ROOM_UPDATE_FAILED);
    }
  };

  const deleteClassroom = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return errorResponse(c, UserErrors.INVALID_CLASS_ID);
    try {
      await classService.deleteClassroom(id.data);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class not found') {
        return errorResponse(c, UserErrors.CLASS_ROOM_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Class is referenced by students'
      ) {
        return errorResponse(c, UserErrors.CLASS_ROOM_REFERENCED_BY_STUDENTS);
      }
      return errorResponse(c, UserErrors.CLASS_ROOM_DELETE_FAILED);
    }
  };

  return {
    getAllClassrooms,
    getClassroomById,
    createClassroom,
    updateClassroom,
    deleteClassroom,
  };
}

function handleWriteError(
  c: Context,
  error: unknown,
  fallbackError:
    | typeof UserErrors.CLASS_ROOM_CREATE_FAILED
    | typeof UserErrors.CLASS_ROOM_UPDATE_FAILED
) {
  if (error instanceof Error && error.message === 'Teacher not found') {
    return errorResponse(c, UserErrors.TEACHER_NOT_FOUND);
  }
  if (error instanceof Error && error.message === 'Class not found') {
    return errorResponse(c, UserErrors.CLASS_ROOM_NOT_FOUND);
  }
  if (error instanceof Error && error.message === 'Class code already exists') {
    return errorResponse(c, UserErrors.CLASS_ROOM_CODE_ALREADY_EXISTS);
  }
  return errorResponse(c, fallbackError);
}
