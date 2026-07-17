import { Context } from 'hono';
import { IStudentService } from '../../application/services/IStudentService';
import {
  studentIdParams,
  type StudentListResponseDTO,
  type StudentResponseDTO,
} from '../openapi/students';

export function createStudentController(studentService: IStudentService) {
  const getStudentById = async (c: Context) => {
    try {
      const parsedParams = studentIdParams.safeParse({
        studentId: c.req.param('studentId') || c.req.param('id'),
      });
      if (!parsedParams.success) {
        return c.json({ error: 'Invalid student ID' }, 400);
      }
      const studentId = Number(parsedParams.data.studentId);

      const student: StudentResponseDTO =
        await studentService.getStudentById(studentId);
      return c.json(student, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        return c.json({ error: 'Student not found' }, 404);
      }
      return c.json({ error: 'Failed to fetch student' }, 500);
    }
  };

  const getAllStudent = async (c: Context) => {
    try {
      const students: StudentListResponseDTO =
        await studentService.getAllStudents();
      return c.json(students, 200);
    } catch {
      return c.json({ error: 'Failed to fetch students' }, 500);
    }
  };

  return {
    getStudentById,
    getAllStudent,
  };
}
