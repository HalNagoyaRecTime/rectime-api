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
    is_staff: false,
    class_rooms: [],
    ...overrides,
  };
}

function setup() {
  const teacherService: ITeacherService = {
    createTeacher: vi.fn(),
    getTeacherById: vi.fn(),
    getAllTeachers: vi.fn(),
    updateTeacher: vi.fn(),
    deleteTeacher: vi.fn(),
    validateTeacherImport: vi.fn(),
    commitTeacherImport: vi.fn(),
  };
  const controller = createTeacherController(teacherService);
  const app = new Hono();
  app.post('/teachers', c => controller.createTeacher(c));
  app.get('/teachers', c => controller.getAllTeachers(c));
  app.get('/teachers/:teacherId', c => controller.getTeacherById(c));
  app.put('/teachers/:teacherId', c => controller.updateTeacher(c));
  app.delete('/teachers/:teacherId', c => controller.deleteTeacher(c));
  return { app, teacherService };
}

describe('TeacherController', () => {
  describe('createTeacher', () => {
    it('正常なリクエストを201で返す', async () => {
      const { app, teacherService } = setup();
      const teacher = buildTeacher();
      (
        teacherService.createTeacher as ReturnType<typeof vi.fn>
      ).mockResolvedValue(teacher);

      const res = await app.request('/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: '山田先生', classRoomIds: [] }),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(teacher);
      expect(teacherService.createTeacher).toHaveBeenCalledWith({
        userName: '山田先生',
        classRoomIds: [],
      });
    });

    it('未知フィールドを400で拒否する', async () => {
      const { app } = setup();
      const res = await app.request('/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: '山田先生',
          classRoomIds: [],
          isLiveActive: false,
        }),
      });
      expect(res.status).toBe(400);
    });

    it('サービスがクラス未存在エラーを返した場合は400を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.createTeacher as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Class room not found'));

      const res = await app.request('/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: '山田先生', classRoomIds: [999999] }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: 'CLASS_ROOM_NOT_FOUND',
          message: '指定されたクラスが見つかりません',
        },
      });
    });
  });
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
      expect(await res.json()).toEqual({
        error: {
          code: 'INVALID_TEACHER_ID',
          message: '教員IDが正しくありません',
        },
      });
    });

    it('サービスが Teacher not found を投げた場合は 404 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Teacher not found'));

      const res = await app.request('/teachers/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'TEACHER_NOT_FOUND', message: '教員が見つかりません' },
      });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/teachers/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'TEACHER_FETCH_FAILED',
          message: '教員の取得に失敗しました',
        },
      });
    });
  });

  describe('getAllTeachers', () => {
    it('サービスが返した教員一覧をページ情報付きで 200 で返す', async () => {
      const { app, teacherService } = setup();
      const page = {
        items: [buildTeacher()],
        total: 1,
        limit: 50,
        offset: 0,
      };
      (
        teacherService.getAllTeachers as ReturnType<typeof vi.fn>
      ).mockResolvedValue(page);

      const res = await app.request('/teachers');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(page);
      expect(teacherService.getAllTeachers).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
        sortBy: 'teacherId',
        sortOrder: 'asc',
      });
    });

    it('クエリパラメータを検索条件としてサービスに渡す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getAllTeachers as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      await app.request(
        '/teachers?search=%E5%B1%B1%E7%94%B0&classRoomId=2&isStaff=false&isLiveActive=true&sortBy=className&sortOrder=desc&offset=5&limit=5'
      );

      expect(teacherService.getAllTeachers).toHaveBeenCalledWith({
        search: '山田',
        classRoomId: 2,
        isStaff: false,
        isLiveActive: true,
        offset: 5,
        limit: 5,
        sortBy: 'className',
        sortOrder: 'desc',
      });
    });

    it('limit が上限(100)を超える場合は400を返す', async () => {
      const { app, teacherService } = setup();
      const res = await app.request('/teachers?limit=101');
      expect(res.status).toBe(400);
      expect(teacherService.getAllTeachers).not.toHaveBeenCalled();
      expect(await res.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('isStaff=all / isLiveActive=all は絞り込みなしとして扱う', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getAllTeachers as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });

      const res = await app.request('/teachers?isStaff=all&isLiveActive=all');

      expect(res.status).toBe(200);
      expect(teacherService.getAllTeachers).toHaveBeenCalledWith({
        sortBy: 'teacherId',
        sortOrder: 'asc',
        limit: 50,
        offset: 0,
      });
    });

    it('未知のクエリパラメータは400を返す', async () => {
      const { app } = setup();
      const res = await app.request('/teachers?page=2');
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
    });

    it('サービスが例外を投げた場合は 500 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getAllTeachers as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/teachers');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'TEACHER_LIST_FAILED',
          message: '教員一覧の取得に失敗しました',
        },
      });
    });
  });

  describe('updateTeacher', () => {
    const validBody = {
      userName: '更新済み先生',
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
      expect(await res.json()).toEqual({
        error: {
          code: 'INVALID_TEACHER_ID',
          message: '教員IDが正しくありません',
        },
      });
    });

    it('isLiveActive を送信した場合は400を返す', async () => {
      const { app, teacherService } = setup();
      const res = await app.request('/teachers/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, isLiveActive: false }),
      });
      expect(res.status).toBe(400);
      expect(teacherService.updateTeacher).not.toHaveBeenCalled();
    });

    it('不正なリクエストボディの場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/teachers/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: '' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toBe('教員の更新内容が正しくありません');
    });

    it('classRoomIds に重複がある場合は 400 を返す', async () => {
      const { app, teacherService } = setup();

      const res = await app.request('/teachers/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: '更新済み先生',
          classRoomIds: [1, 1, 2],
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { message: string } };
      expect(body.error.message).toBe('教員の更新内容が正しくありません');
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
      expect(await res.json()).toEqual({
        error: { code: 'TEACHER_NOT_FOUND', message: '教員が見つかりません' },
      });
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
      expect(await res.json()).toEqual({
        error: {
          code: 'CLASS_ROOM_NOT_FOUND',
          message: '指定されたクラスが見つかりません',
        },
      });
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
      expect(await res.json()).toEqual({
        error: {
          code: 'INVALID_TEACHER_ID',
          message: '教員IDが正しくありません',
        },
      });
    });

    it('サービスが Teacher not found を投げた場合は 404 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.deleteTeacher as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Teacher not found'));

      const res = await app.request('/teachers/999', { method: 'DELETE' });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'TEACHER_NOT_FOUND', message: '教員が見つかりません' },
      });
    });

    it('削除済み教員の再削除も 204 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.deleteTeacher as ReturnType<typeof vi.fn>
      ).mockResolvedValue(undefined);

      const res = await app.request('/teachers/1', { method: 'DELETE' });

      expect(res.status).toBe(204);
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
});
