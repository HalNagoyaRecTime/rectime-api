import { Context } from 'hono';
import { IStaffService } from '../../application/services/IStaffService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';

// 操作者のuser_idを読むハンドラだけが必要とする文脈。既存の参照系ハンドラは
// 素のContextのままにして、変更範囲を広げない。
type StaffRoleContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

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

  const assignStaffRole = async (c: Context) => {
    const userId = parseUserId(c);
    if (userId === null) {
      return errorResponse(c, CommonErrors.VALIDATION_ERROR);
    }

    try {
      await staffService.assignStaffRole(userId);
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        return errorResponse(c, UserErrors.USER_NOT_FOUND);
      }
      return errorResponse(c, UserErrors.STAFF_ROLE_ASSIGN_FAILED);
    }
  };

  const revokeStaffRole = async (c: StaffRoleContext) => {
    // nullはrequireAuthが先に401で弾くため実際には来ないが、型上はnullを
    // 取りうるため分岐を残す。応答コードもrequireAuthと同じものに揃える。
    const operatorUserId = c.get('authenticatedUserId');
    if (operatorUserId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
    }

    const userId = parseUserId(c);
    if (userId === null) {
      return errorResponse(c, CommonErrors.VALIDATION_ERROR);
    }

    try {
      await staffService.revokeStaffRole({
        operator_user_id: operatorUserId,
        user_id: userId,
      });
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'User not found') {
          return errorResponse(c, UserErrors.USER_NOT_FOUND);
        }
        if (error.message === 'Cannot revoke your own staff role') {
          return errorResponse(c, UserErrors.CANNOT_REVOKE_OWN_STAFF);
        }
      }
      return errorResponse(c, UserErrors.STAFF_ROLE_REVOKE_FAILED);
    }
  };

  return {
    getStaffById,
    getAllStaffs,
    assignStaffRole,
    revokeStaffRole,
  };
}

// userIdはルート側(OpenAPI)のpositivePathParamで検証済み。ここは保険であり、
// 応答コードはルート側のvalidationDefaultHookと同じものに揃える。
function parseUserId(c: Context): number | null {
  const userId = Number(c.req.param('userId'));
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}
