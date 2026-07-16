import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createStudentController } from '../../../src/presentation/controllers/StudentController';
import type { IStudentService } from '../../../src/application/services/IStudentService';
import type { StudentDTO } from '../../../src/application/dto/StudentDTO';

function buildStudent(overrides: Partial<StudentDTO> = {}): StudentDTO {
  return {
    student_id: 1,
    display_name: '山田太郎',
    class_room_id: 1,
    attendance_number: 1,
    student_id_number: 'S001',
    ...overrides,
  };
}

function setup() {
  const studentService: IStudentService = {
    getStudentById: vi.fn(),
    getAllStudents: vi.fn(),
  };
  const controller = createStudentController(studentService);
  const app = new Hono();
  app.get('/students', c => controller.getAllStudent(c));
  app.get('/students/by-student-id/:studentId', c =>
    controller.getStudentById(c)
  );
  app.get('/students/by-id/:id', c => controller.getStudentById(c));
  return { app, studentService };
}

describe('StudentController', () => {
  describe('getStudentById', () => {
    it('studentId パラメータで存在する生徒を 200 で返す', async () => {
      const { app, studentService } = setup();
      const student = buildStudent();
      (
        studentService.getStudentById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(student);

      const res = await app.request('/students/by-student-id/1');

      expect(studentService.getStudentById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(student);
    });

    it('id パラメータで存在する生徒を 200 で返す', async () => {
      const { app, studentService } = setup();
      const student = buildStudent();
      (
        studentService.getStudentById as ReturnType<typeof vi.fn>
      ).mockResolvedValue(student);

      const res = await app.request('/students/by-id/1');

      expect(studentService.getStudentById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(student);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/students/by-student-id/abc');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid student ID' });
    });

    it('サービスが Student not found を投げた場合は 404 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.getStudentById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Student not found'));

      const res = await app.request('/students/by-student-id/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Student not found' });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.getStudentById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/students/by-student-id/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch student' });
    });
  });

  describe('getAllStudent', () => {
    it('サービスが返した生徒一覧を 200 で返す', async () => {
      const { app, studentService } = setup();
      const students = [buildStudent()];
      (
        studentService.getAllStudents as ReturnType<typeof vi.fn>
      ).mockResolvedValue(students);

      const res = await app.request('/students');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(students);
    });

    it('サービスが例外を投げた場合は 500 を返す（console.error は呼ばれない）', async () => {
      const { app, studentService } = setup();
      (
        studentService.getAllStudents as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const res = await app.request('/students');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch students' });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
