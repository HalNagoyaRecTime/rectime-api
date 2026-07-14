import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createStudentController } from '../../../src/presentation/controllers/StudentController';
import type { IStudentService } from '../../../src/application/services/IStudentService';
import type { StudentDTO } from '../../../src/application/dto/StudentDTO';
import { ClassNotFoundError } from '../../../src/domain/errors/ClassNotFoundError';
import { DuplicateStudentIdNumberError } from '../../../src/domain/errors/DuplicateStudentIdNumberError';

function buildStudent(overrides: Partial<StudentDTO> = {}): StudentDTO {
  return {
    student_id: 1,
    user_name: '山田太郎',
    class_room_id: 1,
    uid: 'uid-1',
    attendance_number: 1,
    student_id_number: 'S001',
    ...overrides,
  };
}

function setup() {
  const studentService: IStudentService = {
    getStudentById: vi.fn(),
    getAllStudents: vi.fn(),
    createStudent: vi.fn(),
  };
  const controller = createStudentController(studentService);
  const app = new Hono();
  app.get('/students', c => controller.getAllStudent(c));
  app.get('/students/by-student-id/:studentId', c =>
    controller.getStudentById(c)
  );
  app.get('/students/by-id/:id', c => controller.getStudentById(c));
  app.post('/students', c => controller.createStudent(c));
  return { app, studentService };
}

const validCreateBody = {
  class_room_id: 1,
  user_name: 'テスト太郎',
  uid: 'uid-1',
  attendance_number: 1,
  student_id_number: '10000',
};

function postStudents(app: Hono, body: unknown) {
  return app.request('/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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

  describe('createStudent', () => {
    it('成功時は201でサービスの返り値をそのまま返す', async () => {
      const { app, studentService } = setup();
      const createdStudent = buildStudent({
        user_name: 'テスト太郎',
        student_id_number: '10000',
      });
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(createdStudent);

      const res = await postStudents(app, validCreateBody);

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(createdStudent);
      expect(studentService.createStudent).toHaveBeenCalledWith(
        validCreateBody
      );
    });

    it('バリデーションに失敗した場合は400を返し、サービスは呼ばれない', async () => {
      const { app, studentService } = setup();

      const res = await postStudents(app, {
        ...validCreateBody,
        user_name: '',
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Invalid student request body');
      expect(studentService.createStudent).not.toHaveBeenCalled();
    });

    it('クラスが見つからない場合は400を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new ClassNotFoundError(1));

      const res = await postStudents(app, validCreateBody);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Class not found' });
    });

    it('学籍番号が重複している場合は409を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new DuplicateStudentIdNumberError('10000'));

      const res = await postStudents(app, validCreateBody);

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: 'student_id_number already exists',
      });
    });

    it('事前チェックをすり抜けたUNIQUE制約違反(競合状態)でも409を返す', async () => {
      // D1/drizzleが投げる DrizzleQueryError の cause チェーンを模したエラー形状。
      // StudentController.getErrorChainMessage はこの cause を辿ってメッセージを判定する。
      const sqliteError = new Error(
        'D1_ERROR: UNIQUE constraint failed: m_student_description.f_student_id_number: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)'
      );
      const queryError = new Error(
        'Failed query: insert into m_student_description ...',
        { cause: sqliteError }
      );
      const { app, studentService } = setup();
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(queryError);

      const res = await postStudents(app, validCreateBody);

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: 'student_id_number already exists',
      });
    });

    it('その他の予期しないエラーは500を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await postStudents(app, validCreateBody);

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to create student' });
    });
  });
});
