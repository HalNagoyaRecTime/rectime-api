import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createStaffController } from '../../../src/presentation/controllers/StaffController';
import type { IStaffService } from '../../../src/application/services/IStaffService';
import type { StaffDTO } from '../../../src/application/dto/StaffDTO';

function buildStaff(overrides: Partial<StaffDTO> = {}): StaffDTO {
  return {
    staff_id: 1,
    user_id: 10,
    display_name: '佐々木職員',
    ...overrides,
  };
}

function setup() {
  const staffService: IStaffService = {
    getStaffById: vi.fn(),
    getAllStaffs: vi.fn(),
  };
  const controller = createStaffController(staffService);
  const app = new Hono();
  app.get('/staffs', c => controller.getAllStaffs(c));
  app.get('/staffs/:staffId', c => controller.getStaffById(c));
  return { app, staffService };
}

describe('StaffController', () => {
  describe('getStaffById', () => {
    it('存在する職員を 200 で返す', async () => {
      const { app, staffService } = setup();
      const staff = buildStaff();
      (
        staffService.getStaffById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(staff);

      const res = await app.request('/staffs/1');

      expect(staffService.getStaffById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(staff);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/staffs/abc');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid staff ID' });
    });

    it('サービスが Staff not found を投げた場合は 404 を返す', async () => {
      const { app, staffService } = setup();
      (
        staffService.getStaffById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Staff not found'));

      const res = await app.request('/staffs/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Staff not found' });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, staffService } = setup();
      (
        staffService.getStaffById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/staffs/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch staff' });
    });
  });

  describe('getAllStaffs', () => {
    it('サービスが返した職員一覧を 200 で返す', async () => {
      const { app, staffService } = setup();
      const staffs = [buildStaff()];
      (
        staffService.getAllStaffs as ReturnType<typeof vi.fn>
      ).mockResolvedValue(staffs);

      const res = await app.request('/staffs');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(staffs);
    });

    it('サービスが例外を投げた場合は 500 を返す', async () => {
      const { app, staffService } = setup();
      (
        staffService.getAllStaffs as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/staffs');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch staffs' });
    });
  });
});
