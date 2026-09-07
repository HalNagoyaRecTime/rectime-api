import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createStaffController } from '../../../src/presentation/controllers/StaffController';
import type { IStaffService } from '../../../src/application/services/IStaffService';
import type { StaffDTO } from '../../../src/application/dto/StaffDTO';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

function buildStaff(overrides: Partial<StaffDTO> = {}): StaffDTO {
  return {
    staff_id: 1,
    user_id: 10,
    display_name: '佐々木職員',
    ...overrides,
  };
}

// operatorUserId は requireAuth が設定する「操作した本人のuser_id」。
// 自分自身のstaff解除を断る判定に使うため、既定値は対象userIdと重ならない値にする。
function setup(operatorUserId: number | null = 1) {
  const staffService: IStaffService = {
    getStaffById: vi.fn(),
    getAllStaffs: vi.fn(),
    assignStaffRole: vi.fn(),
    revokeStaffRole: vi.fn(),
  };
  const controller = createStaffController(staffService);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set('authenticatedUserId', operatorUserId);
    await next();
  });
  app.get('/staffs', c => controller.getAllStaffs(c));
  app.get('/staffs/:staffId', c => controller.getStaffById(c));
  app.put('/admin/users/:userId/staff', c => controller.assignStaffRole(c));
  app.delete('/admin/users/:userId/staff', c => controller.revokeStaffRole(c));
  return { app, staffService };
}

describe('StaffController', () => {
  describe('getStaffById', () => {
    it('存在する職員を 200 で返す', async () => {
      const { app, staffService } = setup();
      const staff = buildStaff();
      (staffService.getStaffById as ReturnType<typeof vi.fn>).mockResolvedValue(
        staff
      );

      const res = await app.request('/staffs/1');

      expect(staffService.getStaffById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(staff);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/staffs/abc');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: 'INVALID_STAFF_ID',
          message: 'スタッフIDが正しくありません',
        },
      });
    });

    it('サービスが Staff not found を投げた場合は 404 を返す', async () => {
      const { app, staffService } = setup();
      (staffService.getStaffById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Staff not found')
      );

      const res = await app.request('/staffs/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'STAFF_NOT_FOUND', message: 'スタッフが見つかりません' },
      });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, staffService } = setup();
      (staffService.getStaffById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const res = await app.request('/staffs/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'STAFF_FETCH_FAILED',
          message: 'スタッフの取得に失敗しました',
        },
      });
    });
  });

  describe('getAllStaffs', () => {
    it('サービスが返した職員一覧を 200 で返す', async () => {
      const { app, staffService } = setup();
      const staffs = [buildStaff()];
      (staffService.getAllStaffs as ReturnType<typeof vi.fn>).mockResolvedValue(
        staffs
      );

      const res = await app.request('/staffs');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(staffs);
    });

    it('サービスが例外を投げた場合は 500 を返す', async () => {
      const { app, staffService } = setup();
      (staffService.getAllStaffs as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom')
      );

      const res = await app.request('/staffs');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'STAFF_LIST_FAILED',
          message: 'スタッフ一覧の取得に失敗しました',
        },
      });
    });
  });

  describe('assignStaffRole', () => {
    it('付与に成功した場合は本文なしの 204 を返す', async () => {
      const { app, staffService } = setup();

      const res = await app.request('/admin/users/10/staff', { method: 'PUT' });

      expect(staffService.assignStaffRole).toHaveBeenCalledWith(10);
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    it('正の整数でない userId の場合は 400 を返す', async () => {
      const { app, staffService } = setup();

      const res = await app.request('/admin/users/abc/staff', {
        method: 'PUT',
      });

      expect(res.status).toBe(400);
      expect(staffService.assignStaffRole).not.toHaveBeenCalled();
    });

    it('サービスが User not found を投げた場合は 404 を返す', async () => {
      const { app, staffService } = setup();
      (
        staffService.assignStaffRole as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('User not found'));

      const res = await app.request('/admin/users/999/staff', {
        method: 'PUT',
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'ユーザーが見つかりません',
        },
      });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, staffService } = setup();
      (
        staffService.assignStaffRole as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/admin/users/10/staff', { method: 'PUT' });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'STAFF_ROLE_ASSIGN_FAILED',
          message: 'スタッフ権限の付与に失敗しました',
        },
      });
    });
  });

  describe('revokeStaffRole', () => {
    it('解除に成功した場合は本文なしの 204 を返す', async () => {
      const { app, staffService } = setup();

      const res = await app.request('/admin/users/10/staff', {
        method: 'DELETE',
      });

      expect(staffService.revokeStaffRole).toHaveBeenCalledWith({
        operator_user_id: 1,
        user_id: 10,
      });
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    it('サービスが Cannot revoke your own staff role を投げた場合は 400 を返す', async () => {
      const { app, staffService } = setup(6);
      (
        staffService.revokeStaffRole as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Cannot revoke your own staff role'));

      const res = await app.request('/admin/users/6/staff', {
        method: 'DELETE',
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: 'CANNOT_REVOKE_OWN_STAFF',
          message: '自分自身のスタッフ権限を解除することはできません',
        },
      });
    });

    it('操作者を特定できない場合は 401 を返す', async () => {
      const { app, staffService } = setup(null);

      const res = await app.request('/admin/users/10/staff', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
      expect(staffService.revokeStaffRole).not.toHaveBeenCalled();
    });

    it('正の整数でない userId の場合は 400 を返す', async () => {
      const { app, staffService } = setup();

      const res = await app.request('/admin/users/0/staff', {
        method: 'DELETE',
      });

      expect(res.status).toBe(400);
      expect(staffService.revokeStaffRole).not.toHaveBeenCalled();
    });

    it('サービスが User not found を投げた場合は 404 を返す', async () => {
      const { app, staffService } = setup();
      (
        staffService.revokeStaffRole as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('User not found'));

      const res = await app.request('/admin/users/999/staff', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'ユーザーが見つかりません',
        },
      });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, staffService } = setup();
      (
        staffService.revokeStaffRole as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/admin/users/10/staff', {
        method: 'DELETE',
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'STAFF_ROLE_REVOKE_FAILED',
          message: 'スタッフ権限の解除に失敗しました',
        },
      });
    });
  });
});
