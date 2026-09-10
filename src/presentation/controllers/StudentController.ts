import { Context } from 'hono';
import { IStudentService } from '../../application/services/IStudentService';
import { errorResponse } from '../errors/errorResponse';
import { CommonErrors } from '../errors/commonErrors';
import { UserErrors } from '../errors/userErrors';
import {
  studentIdParams,
  studentListQuery,
  studentWriteSchema,
} from '../openapi/students';

function parseStudentId(value: string | undefined): number | null {
  const parsed = studentIdParams.shape.studentId.safeParse(value);
  return parsed.success ? Number(parsed.data) : null;
}

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
      const studentId = parseStudentId(c.req.param('studentId'));
      if (studentId === null) {
        return errorResponse(c, UserErrors.INVALID_STUDENT_ID);
      }

      const student = await studentService.getStudentById(studentId);
      return c.json(student, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        return errorResponse(c, UserErrors.STUDENT_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.STUDENT_FETCH_FAILED);
    }
  };

  const getAllStudent = async (c: Context) => {
    const parsedQuery = studentListQuery.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
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
    const studentId = parseStudentId(c.req.param('studentId'));
    if (studentId === null) {
      return errorResponse(c, UserErrors.INVALID_STUDENT_ID);
    }
    const parsedBody = await parseStudentBody(c);
    if (!parsedBody.success) return parsedBody.response;

    try {
      return c.json(
        await studentService.updateStudent(studentId, parsedBody.data),
        200
      );
    } catch (error) {
      return toStudentErrorResponse(c, error, UserErrors.STUDENT_UPDATE_FAILED);
    }
  };

  return {
    getStudentById,
    getAllStudent,
    createStudent,
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
