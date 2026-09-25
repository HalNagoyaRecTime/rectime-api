import { Context } from 'hono';
import { ITeacherService } from '../../application/services/ITeacherService';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';
import {
  teacherCreateSchema,
  teacherIdParams,
  teacherListQuery,
  teacherUpdateSchema,
} from '../openapi/teachers';

function getTeacherId(c: Context): number | null {
  const parsed = teacherIdParams.safeParse({
    teacherId: c.req.param('teacherId'),
  });
  return parsed.success ? Number(parsed.data.teacherId) : null;
}

export function createTeacherController(teacherService: ITeacherService) {
  const createTeacher = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = teacherCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_TEACHER_CREATE_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const teacher = await teacherService.createTeacher(parsedBody.data);
      return c.json(teacher, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'Class room not found') {
        return errorResponse(c, UserErrors.CLASS_ROOM_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Teacher email already exists'
      ) {
        return errorResponse(c, UserErrors.TEACHER_EMAIL_ALREADY_EXISTS);
      }
      return errorResponse(c, UserErrors.TEACHER_CREATE_FAILED);
    }
  };

  const getTeacherById = async (c: Context) => {
    try {
      const teacherId = getTeacherId(c);

      if (teacherId === null) {
        return errorResponse(c, UserErrors.INVALID_TEACHER_ID);
      }

      const teacher = await teacherService.getTeacherById(teacherId);
      return c.json(teacher, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return errorResponse(c, UserErrors.TEACHER_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.TEACHER_FETCH_FAILED);
    }
  };

  const getAllTeachers = async (c: Context) => {
    const parsedQuery = teacherListQuery.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        parsedQuery.error.flatten()
      );
    }

    try {
      const { isStaff, isLiveActive, ...query } = parsedQuery.data;
      const filter = {
        ...query,
        ...(isStaff === 'all' ? {} : { isStaff: isStaff === 'true' }),
        ...(isLiveActive === 'all'
          ? {}
          : { isLiveActive: isLiveActive === 'true' }),
      };
      const teachers = await teacherService.getAllTeachers(filter);
      return c.json(teachers, 200);
    } catch {
      return errorResponse(c, UserErrors.TEACHER_LIST_FAILED);
    }
  };

  const updateTeacher = async (c: Context) => {
    const teacherId = getTeacherId(c);
    if (teacherId === null) {
      return errorResponse(c, UserErrors.INVALID_TEACHER_ID);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = teacherUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_TEACHER_UPDATE_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const teacher = await teacherService.updateTeacher(
        teacherId,
        parsedBody.data
      );
      return c.json(teacher, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return errorResponse(c, UserErrors.TEACHER_NOT_FOUND);
      }
      if (error instanceof Error && error.message === 'Class room not found') {
        return errorResponse(c, UserErrors.CLASS_ROOM_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Teacher email already exists'
      ) {
        return errorResponse(c, UserErrors.TEACHER_EMAIL_ALREADY_EXISTS);
      }
      return errorResponse(c, UserErrors.TEACHER_UPDATE_FAILED);
    }
  };

  return {
    createTeacher,
    getTeacherById,
    getAllTeachers,
    updateTeacher,
  };
}
