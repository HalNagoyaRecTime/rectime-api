import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createClassController } from '../../../src/presentation/controllers/ClassController';
import type { IClassService } from '../../../src/application/services/IClassService';
import type { ClassDTO } from '../../../src/application/dto/ClassDTO';

function buildClass(overrides: Partial<ClassDTO> = {}): ClassDTO {
  return {
    class_room_id: 1,
    class_code: 'C001',
    name: '1年A組',
    ...overrides,
  };
}

function setup() {
  const classService: IClassService = {
    getAllClasses: vi.fn(),
  };
  const controller = createClassController(classService);
  const app = new Hono();
  app.get('/classes', c => controller.getAllClasses(c));
  return { app, classService };
}

describe('ClassController', () => {
  describe('getAllClasses', () => {
    it('サービスが返したクラス一覧を 200 で返す', async () => {
      const { app, classService } = setup();
      const classes = [buildClass()];
      (
        classService.getAllClasses as ReturnType<typeof vi.fn>
      ).mockResolvedValue(classes);

      const res = await app.request('/classes');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(classes);
    });

    it('サービスが例外を投げた場合は 500 を返す', async () => {
      const { app, classService } = setup();
      (
        classService.getAllClasses as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const res = await app.request('/classes');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch classes' });
      consoleErrorSpy.mockRestore();
    });
  });
});
