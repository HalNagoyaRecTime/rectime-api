import { Context } from 'hono';
import { IStaffService } from '../../application/services/IStaffService';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';

export function createStaffController(staffService: IStaffService) {
  const getStaffById = async (c: Context) => {
    try {
      const id = c.req.param('staffId') || c.req.param('id');
      const staffId = Number(id);

      if (!id || Number.isNaN(staffId)) {
        return errorResponse(c, UserErrors.INVALID_STAFF_ID);
      }

      const staff = await staffService.getStaffById(staffId);
      return c.json(staff, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Staff not found') {
        return errorResponse(c, UserErrors.STAFF_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.STAFF_FETCH_FAILED);
    }
  };

  const getAllStaffs = async (c: Context) => {
    try {
      const staffs = await staffService.getAllStaffs();
      return c.json(staffs, 200);
    } catch {
      return errorResponse(c, UserErrors.STAFF_LIST_FAILED);
    }
  };

  return {
    getStaffById,
    getAllStaffs,
  };
}
