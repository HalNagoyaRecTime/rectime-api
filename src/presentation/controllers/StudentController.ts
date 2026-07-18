import { Context } from 'hono';
import { z } from 'zod';
import { IStudentService } from '../../application/services/IStudentService';
import { ClassNotFoundError } from '../../domain/errors/ClassNotFoundError';
import { DuplicateStudentIdNumberError } from '../../domain/errors/DuplicateStudentIdNumberError';

// D1のエラーは DrizzleQueryError でラップされ、SQLite本来のメッセージは
// error.cause (さらにその cause) に入っているため、chainを辿って結合する。
function getErrorChainMessage(error: unknown): string {
  const messages: string[] = [];
  let current = error;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.join(' ');
}

const createStudentSchema = z.object({
  class_room_id: z.number().int().positive(),
  user_name: z.string().min(1),
  attendance_number: z.number().int().positive(),
  student_id_number: z.coerce.string().min(1),
});

export function createStudentController(studentService: IStudentService) {
  const getStudentById = async (c: Context) => {
    try {
      const id = c.req.param('studentId') || c.req.param('id');
      const studentId = Number(id);

      if (!id || Number.isNaN(studentId)) {
        return c.json({ error: 'Invalid student ID' }, 400);
      }

      const student = await studentService.getStudentById(studentId);
      return c.json(student);
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        return c.json({ error: 'Student not found' }, 404);
      }
      return c.json({ error: 'Failed to fetch student' }, 500);
    }
  };

  const getAllStudent = async (c: Context) => {
    try {
      const students = await studentService.getAllStudents();
      return c.json(students);
    } catch {
      return c.json({ error: 'Failed to fetch students' }, 500);
    }
  };

  const createStudent = async (c: Context) => {
    try {
      const body = await c.req.json();
      const parsedBody = createStudentSchema.safeParse(body);

      if (!parsedBody.success) {
        return c.json(
          {
            error: 'Invalid student request body',
            details: parsedBody.error.flatten(),
          },
          400
        );
      }

      const student = await studentService.createStudent(parsedBody.data);
      return c.json(student, 201);
    } catch (error) {
      if (error instanceof ClassNotFoundError) {
        return c.json({ error: 'Class not found' }, 400);
      }
      if (error instanceof DuplicateStudentIdNumberError) {
        return c.json({ error: 'student_id_number already exists' }, 409);
      }

      const message = getErrorChainMessage(error);
      if (/UNIQUE constraint failed/.test(message)) {
        return c.json({ error: 'student_id_number already exists' }, 409);
      }
      return c.json({ error: 'Failed to create student' }, 500);
    }
  };

  return {
    getStudentById,
    getAllStudent,
    createStudent,
  };
}
