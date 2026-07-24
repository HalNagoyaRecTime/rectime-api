import { Context } from 'hono';
import { IStaffService } from '../../application/services/IStaffService';

export function createStaffController(staffService: IStaffService) {
  const getStaffById = async (c: Context) => {
    try {
      const id = c.req.param('staffId') || c.req.param('id');
      const staffId = Number(id);

      if (!id || Number.isNaN(staffId)) {
        return c.json({ error: 'Invalid staff ID' }, 400);
      }

      const staff = await staffService.getStaffById(staffId);
      return c.json(staff);
    } catch (error) {
      if (error instanceof Error && error.message === 'Staff not found') {
        return c.json({ error: 'Staff not found' }, 404);
      }
      return c.json({ error: 'Failed to fetch staff' }, 500);
    }
  };

  const getAllStaffs = async (c: Context) => {
    try {
      const staffs = await staffService.getAllStaffs();
      return c.json(staffs);
    } catch {
      return c.json({ error: 'Failed to fetch staffs' }, 500);
    }
  };

  return {
    getStaffById,
    getAllStaffs,
  };
}
