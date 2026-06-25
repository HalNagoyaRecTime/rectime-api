import { Context } from 'hono';
import { IClassService } from '../../application/services/IClassService';

export function createClassController(classService: IClassService) {
  const getAllClasses = async (c: Context) => {
    try {
      const classes = await classService.getAllClasses();
      return c.json(classes);
    } catch (error) {
      console.error('Error fetching classes:', error);
      return c.json({ error: 'Failed to fetch classes' }, 500);
    }
  };

  return {
    getAllClasses,
  };
}
