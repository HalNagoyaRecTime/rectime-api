import type { Context } from 'hono';
import { z } from 'zod';
import type { IClassRoomService } from '../../application/services/IClassRoomService';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';

const classIdSchema = z.coerce.number().int().positive();
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
const classRoomRequestSchema = z.object({
  classCode: z.string().trim().min(1),
  className: z.string().trim().min(1),
  teacherId: z.number().int().positive().nullable(),
  teamId: z.number().int().positive().optional(),
});

export function createClassRoomController(classService: IClassRoomService) {
  const getAllClassrooms = async (c: Context) => {
    const query = paginationSchema.safeParse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!query.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_CLASS_LIST_QUERY,
        query.error.flatten()
      );
    }
    try {
      return c.json(
        await classService.getAllClassrooms(
          query.data.limit,
          query.data.offset
        ),
        200
      );
    } catch {
      return errorResponse(c, UserErrors.CLASS_LIST_FAILED);
    }
  };

  const getClassroomById = async (c: Context) => {
    const id = classIdSchema.safeParse(c.req.param('classId'));
    if (!id.success) return errorResponse(c, UserErrors.INVALID_CLASS_ID);
    try {
      return c.json(await classService.getClassroomById(id.data), 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class not found') {
        return errorResponse(c, UserErrors.CLASS_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.CLASS_FETCH_FAILED);
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
      return c.json(
        await classService.createClassroom({
          class_code: body.data.classCode,
          class_name: body.data.className,
          teacher_id: body.data.teacherId,
          team_id: body.data.teamId,
        }),
        201
      );
    } catch (error) {
      return handleWriteError(c, error, UserErrors.CLASS_CREATE_FAILED);
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
        await classService.updateClassroom(id.data, {
          class_code: body.data.classCode,
          class_name: body.data.className,
          teacher_id: body.data.teacherId,
          team_id: body.data.teamId,
        }),
        200
      );
    } catch (error) {
      return handleWriteError(c, error, UserErrors.CLASS_UPDATE_FAILED);
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
        return errorResponse(c, UserErrors.CLASS_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Class is referenced by students'
      ) {
        return errorResponse(c, UserErrors.CLASS_REFERENCED_BY_STUDENTS);
      }
      return errorResponse(c, UserErrors.CLASS_DELETE_FAILED);
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
    | typeof UserErrors.CLASS_CREATE_FAILED
    | typeof UserErrors.CLASS_UPDATE_FAILED
) {
  if (error instanceof Error && error.message === 'Teacher not found') {
    return errorResponse(c, UserErrors.TEACHER_NOT_FOUND);
  }
  if (error instanceof Error && error.message === 'Team not found') {
    return errorResponse(c, UserErrors.TEAM_NOT_FOUND);
  }
  if (error instanceof Error && error.message === 'Class not found') {
    return errorResponse(c, UserErrors.CLASS_NOT_FOUND);
  }
  if (error instanceof Error && error.message === 'Class code already exists') {
    return errorResponse(c, UserErrors.CLASS_CODE_ALREADY_EXISTS);
  }
  if (error instanceof Error && error.message === 'Team name already exists') {
    return errorResponse(c, UserErrors.TEAM_NAME_ALREADY_EXISTS);
  }
  return errorResponse(c, fallbackError);
}
