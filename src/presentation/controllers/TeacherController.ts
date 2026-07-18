import { Context } from 'hono';
import { ITeacherService } from '../../application/services/ITeacherService';

export function createTeacherController(teacherService: ITeacherService) {
  const getTeacherById = async (c: Context) => {
    try {
      const id = c.req.param('teacherId') || c.req.param('id');
      const teacherId = Number(id);

      if (!id || Number.isNaN(teacherId)) {
        return c.json({ error: 'Invalid teacher ID' }, 400);
      }

      const teacher = await teacherService.getTeacherById(teacherId);
      return c.json(teacher);
    } catch (error) {
      if (error instanceof Error && error.message === 'Teacher not found') {
        return c.json({ error: 'Teacher not found' }, 404);
      }
      return c.json({ error: 'Failed to fetch teacher' }, 500);
    }
  };

  const getAllTeachers = async (c: Context) => {
    try {
      const teachers = await teacherService.getAllTeachers();
      return c.json(teachers);
    } catch {
      return c.json({ error: 'Failed to fetch teachers' }, 500);
    }
  };

  return {
    getTeacherById,
    getAllTeachers,
  };
}
