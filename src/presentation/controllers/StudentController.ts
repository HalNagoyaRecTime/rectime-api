import { Context } from 'hono';
import { IStudentService } from '../../application/services/IStudentService';

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

  return {
    getStudentById,
    getAllStudent,
  };
}
