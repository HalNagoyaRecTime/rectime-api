import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createStudentController } from '../../../src/presentation/controllers/StudentController';
import type { IStudentService } from '../../../src/application/services/IStudentService';
import type { StudentDTO } from '../../../src/application/dto/StudentDTO';

const validBody = {
  class_room_id: 1,
  user_name: 'テスト太郎',
  uid: 'uid-1',
  attendance_number: 1,
  student_id_number: '10000',
};

const createdStudent: StudentDTO = {
  student_id: 1,
  user_name: 'テスト太郎',
  class_room_id: 1,
  uid: 'uid-1',
  attendance_number: 1,
  student_id_number: '10000',
};

function buildApp(createStudent: IStudentService['createStudent']) {
  const studentService: IStudentService = {
    getStudentById: vi.fn(),
    getAllStudents: vi.fn(),
    createStudent,
  };
  const controller = createStudentController(studentService);

  const app = new Hono();
  app.post('/students', c => controller.createStudent(c));

  return { app, studentService };
}

function postStudents(app: Hono, body: unknown) {
  return app.request('/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('StudentController.createStudent', () => {
  it('成功時は201でサービスの返り値をそのまま返す', async () => {
    const createStudent = vi.fn().mockResolvedValue(createdStudent);
    const { app } = buildApp(createStudent);

    const res = await postStudents(app, validBody);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(createdStudent);
    expect(createStudent).toHaveBeenCalledWith(validBody);
  });

  it('バリデーションに失敗した場合は400を返し、サービスは呼ばれない', async () => {
    const createStudent = vi.fn();
    const { app } = buildApp(createStudent);

    const res = await postStudents(app, { ...validBody, user_name: '' });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid student request body');
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('クラスが見つからない場合は400を返す', async () => {
    const createStudent = vi.fn().mockRejectedValue(new Error('Class not found'));
    const { app } = buildApp(createStudent);

    const res = await postStudents(app, validBody);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Class not found' });
  });

  it('学籍番号が重複している場合(UNIQUE制約違反)は409を返す', async () => {
    // D1/drizzleが投げる DrizzleQueryError の cause チェーンを模したエラー形状。
    // StudentController.getErrorChainMessage はこの cause を辿ってメッセージを判定する。
    const sqliteError = new Error(
      'D1_ERROR: UNIQUE constraint failed: m_student_description.f_student_id_number: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)'
    );
    const queryError = new Error('Failed query: insert into m_student_description ...', {
      cause: sqliteError,
    });
    const createStudent = vi.fn().mockRejectedValue(queryError);
    const { app } = buildApp(createStudent);

    const res = await postStudents(app, validBody);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'student_id_number already exists',
    });
  });

  it('その他の予期しないエラーは500を返す', async () => {
    const createStudent = vi.fn().mockRejectedValue(new Error('boom'));
    const { app } = buildApp(createStudent);

    const res = await postStudents(app, validBody);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to create student' });
  });
});
