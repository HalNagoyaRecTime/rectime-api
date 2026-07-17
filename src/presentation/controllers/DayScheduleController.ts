import { Context } from 'hono';
import { IDayScheduleService } from '../../application/services/DayScheduleService';

export function createDayScheduleController(service: IDayScheduleService) {
  const getAllItems = async (c: Context) => {
    try {
      const items = await service.getAllItems();
      return c.json({ items, total: items.length });
    } catch (error) {
      console.error('Error fetching day schedule:', error);
      return c.json(
        { error: 'Failed to fetch day schedule', code: 'INTERNAL_ERROR' },
        500
      );
    }
  };

  return { getAllItems };
}
