import type { Context } from 'hono';
import type { IClassRoomService } from '../../application/services/IClassRoomService';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';
import { CommonErrors } from '../errors/commonErrors';
import {
  classIdParams,
  classRoomListQuery,
  classRoomWriteSchema,
} from '../openapi/classrooms';

export function createClassRoomController(classService: IClassRoomService) {
  const getAllClassrooms = async (c: Context) => {
    const query = classRoomListQuery.safeParse(c.req.query());
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
    const id = parseClassRoomId(c);
    if (id === null) return errorResponse(c, UserErrors.INVALID_CLASS_ID);
    try {
      return c.json(await classService.getClassroomById(id), 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class not found') {
        return errorResponse(c, UserErrors.CLASS_ROOM_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.CLASS_ROOM_FETCH_FAILED);
    }
  };

  const parseBody = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    return classRoomWriteSchema.safeParse(body);
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
    const id = parseClassRoomId(c);
    if (id === null) return errorResponse(c, UserErrors.INVALID_CLASS_ID);
    const body = await parseBody(c);
    if (!body.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_CLASS_REQUEST,
        body.error.flatten()
      );
    }
    try {
      return c.json(await classService.updateClassroom(id, body.data), 200);
    } catch (error) {
      return handleWriteError(c, error, UserErrors.CLASS_ROOM_UPDATE_FAILED);
    }
  };

  const deleteClassroom = async (c: Context) => {
    const id = parseClassRoomId(c);
    if (id === null) return errorResponse(c, UserErrors.INVALID_CLASS_ID);
    try {
      await classService.deleteClassroom(id);
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

function parseClassRoomId(c: Context): number | null {
  const parsed = classIdParams.safeParse({ classId: c.req.param('classId') });
  return parsed.success ? Number(parsed.data.classId) : null;
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
