import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createStudentController } from '../../../src/presentation/controllers/StudentController';
import type { IStudentService } from '../../../src/application/services/IStudentService';
import type { StudentManagementDTO } from '../../../src/application/dto/StudentDTO';

function buildStudent(
  overrides: Partial<StudentManagementDTO> = {}
): StudentManagementDTO {
  return {
    student_id: 1,
    user_id: 10,
    display_name: '山田太郎',
    attendance_number: 1,
    student_id_number: 'S001',
    is_live_active: true,
    is_staff: false,
    class_room: {
      class_room_id: 1,
      class_code: '1A',
      class_name: '1年A組',
    },
    ...overrides,
  };
}

function setup() {
  const studentService: IStudentService = {
    getStudentById: vi.fn(),
    getAllStudents: vi.fn(),
    createStudent: vi.fn(),
    updateStudent: vi.fn(),
    getByUserId: vi.fn(),
    validateStudentImport: vi.fn(),
    commitStudentImport: vi.fn(),
  };
  const controller = createStudentController(studentService);
  const app = new Hono();
  app.get('/students', c => controller.getAllStudent(c));
  app.get('/students/:studentId', c => controller.getStudentById(c));
  app.post('/students', c => controller.createStudent(c));
  app.put('/students/:studentId', c => controller.updateStudent(c));
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

      const res = await app.request('/students/1');

      expect(studentService.getStudentById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(student);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/students/abc');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: {
          code: 'INVALID_STUDENT_ID',
          message: '学生IDが正しくありません',
        },
      });
    });

    it('サービスが Student not found を投げた場合は 404 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.getStudentById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Student not found'));

      const res = await app.request('/students/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'STUDENT_NOT_FOUND', message: '学生が見つかりません' },
      });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.getStudentById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/students/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'STUDENT_FETCH_FAILED',
          message: '学生の取得に失敗しました',
        },
      });
    });
  });

  describe('getAllStudent', () => {
    it('サービスが返した生徒一覧を 200 で返す', async () => {
      const { app, studentService } = setup();
      const students = [buildStudent()];
      (
        studentService.getAllStudents as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ items: students, total: 1, limit: 50, offset: 0 });

      const res = await app.request('/students');

      expect(res.status).toBe(200);
      expect(studentService.getAllStudents).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
        sortBy: 'studentId',
        sortOrder: 'asc',
      });
      expect(await res.json()).toEqual({
        items: students,
        total: 1,
        limit: 50,
        offset: 0,
      });
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
      expect(await res.json()).toEqual({
        error: {
          code: 'STUDENT_LIST_FAILED',
          message: '学生一覧の取得に失敗しました',
        },
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('不正なページング指定は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/students?limit=0');

      expect(res.status).toBe(400);
      expect(
        ((await res.json()) as { error: { message: string } }).error.message
      ).toBe('リクエスト内容が正しくありません');
    });
  });

  describe('createStudent', () => {
    const input = {
      display_name: '新規学生',
      class_room_id: 1,
      attendance_number: 10,
      student_id_number: 'S010',
    };

    it('有効な入力で 201 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(buildStudent({ ...input }));

      const res = await app.request('/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      expect(res.status).toBe(201);
      expect(studentService.createStudent).toHaveBeenCalledWith(input);
    });

    it('学籍番号重複は 409 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Student number already exists'));

      const res = await app.request('/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: {
          code: 'STUDENT_NUMBER_ALREADY_EXISTS',
          message: '同じ学籍番号の学生が既に存在します',
        },
      });
    });

    it('存在しないクラスは 404 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Class room not found'));

      const res = await app.request('/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: {
          code: 'CLASS_ROOM_NOT_FOUND',
          message: '指定されたクラスが見つかりません',
        },
      });
    });

    it('DBの学籍番号UNIQUE制約違反がラップされていても409を返す', async () => {
      const { app, studentService } = setup();
      const sqliteError = new Error(
        'UNIQUE constraint failed: students.student_id_number'
      );
      const d1Error = new Error('D1_ERROR: constraint failed', {
        cause: sqliteError,
      });
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('Failed query: insert into students', {
          cause: d1Error,
        })
      );

      const res = await app.request('/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: {
          code: 'STUDENT_NUMBER_ALREADY_EXISTS',
          message: '同じ学籍番号の学生が既に存在します',
        },
      });
    });

    it('別のUNIQUE制約違反は500を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.createStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('UNIQUE constraint failed: students.user_id')
      );

      const res = await app.request('/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: {
          code: 'STUDENT_CREATE_FAILED',
          message: '学生の登録に失敗しました',
        },
      });
    });
  });

  describe('updateStudent', () => {
    const input = {
      display_name: '更新学生',
      class_room_id: 1,
      attendance_number: 10,
      student_id_number: 'S010',
    };

    it('更新し、200 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.updateStudent as ReturnType<typeof vi.fn>
      ).mockResolvedValue(buildStudent({ ...input }));

      const res = await app.request('/students/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      expect(res.status).toBe(200);
      expect(studentService.updateStudent).toHaveBeenCalledWith(1, input);
    });

    it('更新時の学籍番号UNIQUE制約違反も409を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.updateStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('UNIQUE constraint failed: students.student_id_number')
      );

      const res = await app.request('/students/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: {
          code: 'STUDENT_NUMBER_ALREADY_EXISTS',
          message: '同じ学籍番号の学生が既に存在します',
        },
      });
    });

    it('存在しないクラスは 404 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.updateStudent as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Class room not found'));

      const res = await app.request('/students/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: {
          code: 'CLASS_ROOM_NOT_FOUND',
          message: '指定されたクラスが見つかりません',
        },
      });
    });
  });
});
