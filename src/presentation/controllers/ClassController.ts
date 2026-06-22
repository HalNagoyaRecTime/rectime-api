import { Context } from 'hono';
import { ClassControllerFunctions } from '../types/controllers';
import { ClassServiceFunctions } from '../types/services';

export function createClassController(
  classService: ClassServiceFunctions
): ClassControllerFunctions {
  const getAllClasses = async (c: Context) => {
    try {
      const classes = await classService.getAllClasses();
      return c.json(classes);
    } catch {
      return c.json({ error: 'Failed to fetch classes' }, 500);
    }
  };

  return {
    getAllClasses,
  };
}
