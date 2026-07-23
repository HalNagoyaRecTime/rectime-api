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
    validateClassRoomImport: vi.fn(),
    commitClassRoomImport: vi.fn(),
  };
  const controller = createClassRoomController(classService);
  const app = new Hono();
  app.get('/classrooms', c => controller.getAllClassRooms(c));
  app.post('/classrooms/master-imports/validate', c =>
    controller.validateClassRoomImport(c)
  );
  app.post('/classrooms/master-imports/commit', c =>
    controller.commitClassRoomImport(c)
  );
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

  describe('validateClassRoomImport', () => {
    const validRow = { class_code: '13C', class_name: '3年Cクラス' };

    it('サービスの検査結果をそのまま200で返す', async () => {
      const { app, classService } = setup();
      const result = {
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      };
      (
        classService.validateClassRoomImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/classrooms/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
      expect(classService.validateClassRoomImport).toHaveBeenCalledWith({
        rows: [validRow],
      });
    });

    it('rowsが空配列の場合は400を返す', async () => {
      const { app, classService } = setup();

      const res = await app.request('/classrooms/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(classService.validateClassRoomImport).not.toHaveBeenCalled();
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, classService } = setup();
      (
        classService.validateClassRoomImport as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/classrooms/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to validate class room import',
      });
    });
  });

  describe('commitClassRoomImport', () => {
    const validRow = { class_code: '13C', class_name: '3年Cクラス' };

    it('全行成功の場合は201で結果を返す', async () => {
      const { app, classService } = setup();
      const result = { total: 1, imported: 1, error_count: 0, errors: [] };
      (
        classService.commitClassRoomImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/classrooms/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(result);
    });

    it('エラー行がある場合は422を返し、1件も登録しない', async () => {
      const { app, classService } = setup();
      const result = {
        total: 1,
        imported: 0,
        error_count: 1,
        errors: [
          {
            row_index: 0,
            class_code: '13C',
            class_name: '3年Cクラス',
            reason: 'class_code_duplicate_in_db',
          },
        ],
      };
      (
        classService.commitClassRoomImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/classrooms/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(422);
      expect(await res.json()).toEqual(result);
    });

    it('rowsが空配列の場合は400を返す', async () => {
      const { app, classService } = setup();

      const res = await app.request('/classrooms/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(classService.commitClassRoomImport).not.toHaveBeenCalled();
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, classService } = setup();
      (
        classService.commitClassRoomImport as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/classrooms/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to commit class room import',
      });
    });
  });
});
