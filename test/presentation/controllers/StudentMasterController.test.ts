import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createStudentMasterController } from '../../../src/presentation/controllers/StudentMasterController';
import type { IStudentMasterService } from '../../../src/application/services/IStudentMasterService';
import { StudentMasterDuplicateError } from '../../../src/domain/errors/StudentMasterDuplicateError';

function setup() {
  const studentMasterService: IStudentMasterService = {
    importStudentMaster: vi.fn(),
  };
  const controller = createStudentMasterController(studentMasterService);
  const app = new Hono();
  app.post('/student-master/import', c => controller.importStudentMaster(c));
  return { app, studentMasterService };
}

const validBody = {
  rows: [
    {
      class_code: 11,
      attendance_number: 1,
      student_id_number: 90000,
      user_name: 'テスト太郎',
    },
  ],
};

function postImport(app: Hono, body: unknown) {
  return app.request('/student-master/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('StudentMasterController.importStudentMaster', () => {
  it('成功時は201でインポート件数を返す', async () => {
    const { app, studentMasterService } = setup();
    (
      studentMasterService.importStudentMaster as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ imported: 1 });

    const res = await postImport(app, validBody);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ imported: 1 });
    expect(studentMasterService.importStudentMaster).toHaveBeenCalledWith(
      validBody
    );
  });

  it('body が空の場合は400を返す', async () => {
    const { app, studentMasterService } = setup();

    const res = await app.request('/student-master/import', {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid student master import request body');
    expect(studentMasterService.importStudentMaster).not.toHaveBeenCalled();
  });

  it('rows が空配列の場合は400を返す', async () => {
    const { app, studentMasterService } = setup();

    const res = await postImport(app, { rows: [] });

    expect(res.status).toBe(400);
    expect(studentMasterService.importStudentMaster).not.toHaveBeenCalled();
  });

  it('重複がある場合は409で重複箇所の一覧を返す', async () => {
    const { app, studentMasterService } = setup();
    (
      studentMasterService.importStudentMaster as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new StudentMasterDuplicateError([
        {
          rowIndex: 0,
          classCode: 11,
          attendanceNumber: 1,
          studentIdNumber: 90000,
          userName: 'テスト太郎',
          reasons: ['student_id_number_duplicate_in_db'],
        },
      ])
    );

    const res = await postImport(app, validBody);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Duplicate student master data',
      duplicates: [
        {
          row_index: 0,
          class_code: 11,
          attendance_number: 1,
          student_id_number: 90000,
          user_name: 'テスト太郎',
          reasons: ['student_id_number_duplicate_in_db'],
        },
      ],
    });
  });

  it('その他の予期しないエラーは500を返す', async () => {
    const { app, studentMasterService } = setup();
    (
      studentMasterService.importStudentMaster as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('boom'));

    const res = await postImport(app, validBody);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'Failed to import student master data',
    });
  });
});
