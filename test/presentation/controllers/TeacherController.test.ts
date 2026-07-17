import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createTeacherController } from '../../../src/presentation/controllers/TeacherController';
import type { ITeacherService } from '../../../src/application/services/ITeacherService';
import type { TeacherDTO } from '../../../src/application/dto/TeacherDTO';

function buildTeacher(overrides: Partial<TeacherDTO> = {}): TeacherDTO {
  return {
    teacher_id: 1,
    user_id: 100,
    display_name: '教員太郎',
    ...overrides,
  };
}

function setup() {
  const teacherService: ITeacherService = {
    getTeacherById: vi.fn(),
    getAllTeachers: vi.fn(),
  };
  const controller = createTeacherController(teacherService);
  const app = new Hono();
  app.get('/teachers', c => controller.getAllTeachers(c));
  app.get('/teachers/by-teacher-id/:teacherId', c =>
    controller.getTeacherById(c)
  );
  app.get('/teachers/by-id/:id', c => controller.getTeacherById(c));
  return { app, teacherService };
}

describe('TeacherController', () => {
  describe('getTeacherById', () => {
    it('teacherId パラメータで存在する教員を 200 で返す', async () => {
      const { app, teacherService } = setup();
      const teacher = buildTeacher();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(teacher);

      const res = await app.request('/teachers/by-teacher-id/1');

      expect(teacherService.getTeacherById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(teacher);
    });

    it('id パラメータで存在する教員を 200 で返す', async () => {
      const { app, teacherService } = setup();
      const teacher = buildTeacher();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(teacher);

      const res = await app.request('/teachers/by-id/1');

      expect(teacherService.getTeacherById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(teacher);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/teachers/by-teacher-id/abc');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid teacher ID' });
    });

    it('0 以下の ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/teachers/by-teacher-id/0');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid teacher ID' });
    });

    it('サービスが Teacher not found を投げた場合は 404 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Teacher not found'));

      const res = await app.request('/teachers/by-teacher-id/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Teacher not found' });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.getTeacherById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/teachers/by-teacher-id/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch teacher' });
    });
  });

  describe('getAllTeachers', () => {
    it('サービスが返した教員一覧を 200 で返す', async () => {
      const { app, teacherService } = setup();
      const teachers = [buildTeacher()];
      (
        teacherService.getAllTeachers as ReturnType<typeof vi.fn>
      ).mockResolvedValue(teachers);

      const res = await app.request('/teachers');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(teachers);
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
});
