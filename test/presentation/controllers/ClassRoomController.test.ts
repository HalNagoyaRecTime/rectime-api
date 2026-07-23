import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createClassRoomController } from '../../../src/presentation/controllers/ClassRoomController';
import type { IClassRoomService } from '../../../src/application/services/IClassRoomService';
import type { ClassRoomDTO } from '../../../src/application/dto/ClassRoomDTO';

function buildClass(overrides: Partial<ClassRoomDTO> = {}): ClassRoomDTO {
  return {
    class_room_id: 1,
    class_code: 'C001',
    class_name: '1年A組',
    ...overrides,
  };
}

function setup() {
  const classService: IClassRoomService = {
    getAllClassRooms: vi.fn(),
  };
  const controller = createClassRoomController(classService);
  const app = new Hono();
  app.get('/classrooms', c => controller.getAllClassRooms(c));
  return { app, classService };
}

describe('ClassRoomController', () => {
  describe('getAllClassRooms', () => {
    it('サービスが返したクラス一覧を 200 で返す', async () => {
      const { app, classService } = setup();
      const classRooms = [buildClass()];
      (
        classService.getAllClassRooms as ReturnType<typeof vi.fn>
      ).mockResolvedValue(classRooms);

      const res = await app.request('/classrooms');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(classRooms);
    });

    it('サービスが例外を投げた場合は 500 を返す', async () => {
      const { app, classService } = setup();
      (
        classService.getAllClassRooms as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const res = await app.request('/classrooms');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to fetch class rooms',
      });
      consoleErrorSpy.mockRestore();
    });
  });
});
