import { Context } from 'hono';
import { z } from 'zod';
import { IStudentService } from '../../application/services/IStudentService';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';

const studentIdSchema = z.coerce.number().int().positive();
const studentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const studentWriteSchema = z.object({
  display_name: z.string().trim().min(1).max(100),
  class_room_id: z.number().int().positive(),
  attendance_number: z.number().int().positive(),
  student_id_number: z.string().trim().min(1).max(100),
});

function getErrorChainMessage(error: unknown): string {
  const messages: string[] = [];
  const visited = new Set<Error>();
  let current = error;

  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    messages.push(current.message);
    current = current.cause;
  }

  return messages.join(' ');
}

function isStudentNumberUniqueConstraintError(error: unknown): boolean {
  const message = getErrorChainMessage(error);
  return (
    message.includes('UNIQUE constraint failed') &&
    message.includes('students.student_id_number')
  );
}

export function createStudentController(studentService: IStudentService) {
  const getStudentById = async (c: Context) => {
    try {
      const parsedId = studentIdSchema.safeParse(c.req.param('studentId'));
      if (!parsedId.success) {
        return errorResponse(c, UserErrors.INVALID_STUDENT_ID);
      }

      const student = await studentService.getStudentById(parsedId.data);
      return c.json(student, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        return errorResponse(c, UserErrors.STUDENT_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.STUDENT_FETCH_FAILED);
    }
  };

  const getAllStudent = async (c: Context) => {
    const parsedQuery = studentListQuerySchema.safeParse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_STUDENT_LIST_QUERY,
        parsedQuery.error.flatten()
      );
    }

    try {
      return c.json(await studentService.getAllStudents(parsedQuery.data), 200);
    } catch {
      return errorResponse(c, UserErrors.STUDENT_LIST_FAILED);
    }
  };

  const createStudent = async (c: Context) => {
    const parsedBody = await parseStudentBody(c);
    if (!parsedBody.success) return parsedBody.response;

    try {
      return c.json(await studentService.createStudent(parsedBody.data), 201);
    } catch (error) {
      return toStudentErrorResponse(c, error, UserErrors.STUDENT_CREATE_FAILED);
    }
  };

  const updateStudent = async (c: Context) => {
    const parsedId = studentIdSchema.safeParse(c.req.param('studentId'));
    if (!parsedId.success) {
      return errorResponse(c, UserErrors.INVALID_STUDENT_ID);
    }
    const parsedBody = await parseStudentBody(c);
    if (!parsedBody.success) return parsedBody.response;

    try {
      return c.json(
        await studentService.updateStudent(parsedId.data, parsedBody.data),
        200
      );
    } catch (error) {
      return toStudentErrorResponse(c, error, UserErrors.STUDENT_UPDATE_FAILED);
    }
  };

  const deleteStudent = async (c: Context) => {
    const parsedId = studentIdSchema.safeParse(c.req.param('studentId'));
    if (!parsedId.success) {
      return c.json({ error: 'Invalid student ID' }, 400);
    }

    try {
      await studentService.deleteStudent(parsedId.data);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        return c.json({ error: error.message }, 404);
      }
      return c.json({ error: 'Failed to delete student' }, 500);
    }
  };

  return {
    getStudentById,
    getAllStudent,
    createStudent,
    deleteStudent,
    updateStudent,
  };
}

async function parseStudentBody(c: Context) {
  const body = await c.req.json().catch(() => undefined);
  const parsedBody = studentWriteSchema.safeParse(body);
  if (parsedBody.success) {
    return { success: true as const, data: parsedBody.data };
  }
  return {
    success: false as const,
    response: errorResponse(
      c,
      UserErrors.INVALID_STUDENT_REQUEST,
      parsedBody.error.flatten()
    ),
  };
}

function toStudentErrorResponse(
  c: Context,
  error: unknown,
  fallbackError:
    | typeof UserErrors.STUDENT_CREATE_FAILED
    | typeof UserErrors.STUDENT_UPDATE_FAILED
) {
  if (!(error instanceof Error)) {
    return errorResponse(c, fallbackError);
  }
  if (error.message === 'Student not found') {
    return errorResponse(c, UserErrors.STUDENT_NOT_FOUND);
  }
  if (error.message === 'Class room not found') {
    return errorResponse(c, UserErrors.STUDENT_CLASS_ROOM_NOT_FOUND);
  }
  if (
    error.message === 'Student number already exists' ||
    isStudentNumberUniqueConstraintError(error)
  ) {
    return errorResponse(c, UserErrors.STUDENT_NUMBER_ALREADY_EXISTS);
  }
  return errorResponse(c, fallbackError);
}
