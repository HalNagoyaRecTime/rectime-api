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
    class_room_name: '1年A組',
    attendance_number: 1,
    student_id_number: 'S001',
    is_live_active: true,
    ...overrides,
  };
}

function setup() {
  const studentService: IStudentService = {
    getStudentById: vi.fn(),
    getAllStudents: vi.fn(),
    createStudent: vi.fn(),
    updateStudent: vi.fn(),
    bulkImportStudents: vi.fn(),
  };
  const controller = createStudentController(studentService);
  const app = new Hono();
  app.get('/students', c => controller.getAllStudent(c));
  app.get('/students/:studentId', c => controller.getStudentById(c));
  app.post('/students', c => controller.createStudent(c));
  app.put('/students/:studentId', c => controller.updateStudent(c));
  app.post('/students/bulk-import', c => controller.bulkImportStudents(c));
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
      expect(await res.json()).toEqual({ error: 'Invalid student ID' });
    });

    it('サービスが Student not found を投げた場合は 404 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.getStudentById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Student not found'));

      const res = await app.request('/students/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Student not found' });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.getStudentById as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const res = await app.request('/students/1');

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
      ).mockResolvedValue({ students, total: 1, limit: 50, offset: 0 });

      const res = await app.request('/students');

      expect(res.status).toBe(200);
      expect(studentService.getAllStudents).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
      });
      expect(await res.json()).toEqual({
        students,
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
      expect(await res.json()).toEqual({ error: 'Failed to fetch students' });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('不正なページング指定は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/students?limit=0');

      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(
        'Invalid student list query'
      );
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
        error: 'Student number already exists',
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
        error: 'Student number already exists',
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
        error: 'Failed to create student',
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
        error: 'Student number already exists',
      });
    });
  });

  describe('bulkImportStudents', () => {
    const validRow = {
      class_code: '11A',
      attendance_number: 1,
      student_id_number: 'S010',
      last_name: '新規',
      first_name: '太郎',
    };

    it('サービスの結果をそのまま201で返す', async () => {
      const { app, studentService } = setup();
      const result = { imported: 1, skipped: [] };
      (
        studentService.bulkImportStudents as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(result);
      expect(studentService.bulkImportStudents).toHaveBeenCalledWith({
        rows: [validRow],
      });
    });

    it('スキップ行があっても201を返す', async () => {
      const { app, studentService } = setup();
      const result = {
        imported: 0,
        skipped: [
          {
            row_index: 0,
            class_code: '11A',
            attendance_number: 1,
            student_id_number: 'S010',
            display_name: '新規太郎',
            reason: 'student_id_number_duplicate_in_db',
          },
        ],
      };
      (
        studentService.bulkImportStudents as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(result);
    });

    it('rowsが空配列の場合は400を返す', async () => {
      const { app, studentService } = setup();

      const res = await app.request('/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(studentService.bulkImportStudents).not.toHaveBeenCalled();
    });

    it('不正なJSONの場合は400を返す', async () => {
      const { app } = setup();

      const res = await app.request('/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      });

      expect(res.status).toBe(400);
    });

    it('last_nameが欠けている場合は400を返す', async () => {
      const { app } = setup();
      const rowWithoutLastName: Record<string, unknown> = { ...validRow };
      delete rowWithoutLastName.last_name;

      const res = await app.request('/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [rowWithoutLastName] }),
      });

      expect(res.status).toBe(400);
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, studentService } = setup();
      (
        studentService.bulkImportStudents as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to bulk import students',
      });
    });
  });
});
