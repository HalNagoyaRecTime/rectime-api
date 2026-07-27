import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createTeacherController } from '../../../src/presentation/controllers/TeacherController';
import type { ITeacherService } from '../../../src/application/services/ITeacherService';
import type { TeacherDTO } from '../../../src/application/dto/TeacherDTO';

function buildTeacher(overrides: Partial<TeacherDTO> = {}): TeacherDTO {
  return {
    teacher_id: 1,
    user_id: 10,
    display_name: '山田先生',
    is_live_active: true,
    class_rooms: [],
    ...overrides,
  };
}

function setup() {
  const teacherService: ITeacherService = {
    getTeacherById: vi.fn(),
    getAllTeachers: vi.fn(),
    updateTeacher: vi.fn(),
    deleteTeacher: vi.fn(),
    validateTeacherImport: vi.fn(),
    commitTeacherImport: vi.fn(),
  };
  const controller = createTeacherController(teacherService);
  const app = new Hono();
  app.get('/teachers', c => controller.getAllTeachers(c));
  app.get('/teachers/:teacherId', c => controller.getTeacherById(c));
  app.put('/teachers/:teacherId', c => controller.updateTeacher(c));
  app.delete('/teachers/:teacherId', c => controller.deleteTeacher(c));
  app.post('/teachers/master-imports/validate', c =>
    controller.validateTeacherImport(c)
  );
  app.post('/teachers/master-imports/commit', c =>
    controller.commitTeacherImport(c)
  );
  return { app, teacherService };
}

describe('TeacherController', () => {
  describe('getTeacherById', () => {
    it('存在する教員を 200 で返す', async () => {
      const { app, teacherService } = setup();
      const teacher = buildTeacher();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(teacher);

      const res = await app.request('/teachers/1');

      expect(teacherService.getTeacherById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(teacher);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/teachers/abc');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid teacher ID' });
    });

    it('サービスが Teacher not found を投げた場合は 404 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Teacher not found'));

      const res = await app.request('/teachers/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Teacher not found' });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/teachers/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch teacher' });
    });
  });

  describe('getAllTeachers', () => {
    it('サービスが返した教員一覧をページ情報付きで 200 で返す', async () => {
      const { app, teacherService } = setup();
      const page = {
        items: [buildTeacher()],
        total: 1,
        page: 1,
        limit: 20,
        total_pages: 1,
      };
      (
        teacherService.getAllTeachers as ReturnType<typeof vi.fn>
      ).mockResolvedValue(page);

      const res = await app.request('/teachers');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(page);
    });

    it('クエリパラメータを検索条件としてサービスに渡す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getAllTeachers as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        total_pages: 0,
      });

      await app.request(
        '/teachers?teacherId=1&userName=%E5%B1%B1%E7%94%B0&classRoomId=2&isLiveActive=false&page=2&limit=5'
      );

      expect(teacherService.getAllTeachers).toHaveBeenCalledWith({
        teacherId: 1,
        userName: '山田',
        classRoomId: 2,
        isLiveActive: false,
        page: 2,
        limit: 5,
      });
    });

    it('サービスが例外を投げた場合は 500 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getAllTeachers as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/teachers');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch teachers' });
    });
  });

  describe('updateTeacher', () => {
    const validBody = {
      userName: '更新済み先生',
      isLiveActive: false,
      classRoomIds: [1, 2],
    };

    it('更新後の教員を 200 で返す', async () => {
      const { app, teacherService } = setup();
      const updated = buildTeacher({ display_name: '更新済み先生' });
      (
        teacherService.updateTeacher as ReturnType<typeof vi.fn>
      ).mockResolvedValue(updated);

      const res = await app.request('/teachers/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(teacherService.updateTeacher).toHaveBeenCalledWith(1, validBody);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(updated);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/teachers/abc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid teacher ID' });
    });

    it('不正なリクエストボディの場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/teachers/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: '' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid teacher update request body');
    });

    it('classRoomIds に重複がある場合は 400 を返す', async () => {
      const { app, teacherService } = setup();

      const res = await app.request('/teachers/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: '更新済み先生',
          isLiveActive: false,
          classRoomIds: [1, 1, 2],
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid teacher update request body');
      expect(teacherService.updateTeacher).not.toHaveBeenCalled();
    });

    it('サービスが Teacher not found を投げた場合は 404 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.updateTeacher as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Teacher not found'));

      const res = await app.request('/teachers/999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Teacher not found' });
    });

    it('サービスが Class room not found を投げた場合は 400 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.updateTeacher as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Class room not found'));

      const res = await app.request('/teachers/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Class room not found' });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.updateTeacher as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/teachers/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(500);
    });
  });

  describe('deleteTeacher', () => {
    it('削除に成功した場合は 204 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.deleteTeacher as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      const res = await app.request('/teachers/1', { method: 'DELETE' });

      expect(teacherService.deleteTeacher).toHaveBeenCalledWith(1);
      expect(res.status).toBe(204);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/teachers/abc', { method: 'DELETE' });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid teacher ID' });
    });

    it('サービスが Teacher not found を投げた場合は 404 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.deleteTeacher as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Teacher not found'));

      const res = await app.request('/teachers/999', { method: 'DELETE' });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Teacher not found' });
    });

    it('サービスが Teacher is referenced by other data を投げた場合は 409 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.deleteTeacher as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Teacher is referenced by other data'));

      const res = await app.request('/teachers/1', { method: 'DELETE' });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: 'Teacher is referenced by other data',
      });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.deleteTeacher as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/teachers/1', { method: 'DELETE' });

      expect(res.status).toBe(500);
    });
  });

  describe('validateTeacherImport', () => {
    const validRow = { last_name: '田中', first_name: '太郎' };

    it('サービスの検査結果をそのまま200で返す', async () => {
      const { app, teacherService } = setup();
      const result = {
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      };
      (
        teacherService.validateTeacherImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/teachers/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
      expect(teacherService.validateTeacherImport).toHaveBeenCalledWith({
        rows: [validRow],
      });
    });

    it('rowsが空配列の場合は400を返す', async () => {
      const { app, teacherService } = setup();

      const res = await app.request('/teachers/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(teacherService.validateTeacherImport).not.toHaveBeenCalled();
    });

    it('last_nameが欠けている場合は400を返す', async () => {
      const { app } = setup();
      const rowWithoutLastName: Record<string, unknown> = { ...validRow };
      delete rowWithoutLastName.last_name;

      const res = await app.request('/teachers/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [rowWithoutLastName] }),
      });

      expect(res.status).toBe(400);
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.validateTeacherImport as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/teachers/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to validate teacher import',
      });
    });
  });

  describe('commitTeacherImport', () => {
    const validRow = { last_name: '田中', first_name: '太郎' };

    it('全行成功の場合は201で結果を返す', async () => {
      const { app, teacherService } = setup();
      const result = { total: 1, imported: 1, error_count: 0, errors: [] };
      (
        teacherService.commitTeacherImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/teachers/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(result);
    });

    it('rowsが空配列の場合は400を返す', async () => {
      const { app, teacherService } = setup();

      const res = await app.request('/teachers/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(teacherService.commitTeacherImport).not.toHaveBeenCalled();
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.commitTeacherImport as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/teachers/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to commit teacher import',
      });
    });
  });
});
