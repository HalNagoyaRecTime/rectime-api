import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createClassRoomController } from '../../../src/presentation/controllers/ClassRoomController';
import type { IClassRoomService } from '../../../src/application/services/IClassRoomService';

function setup() {
  const service: IClassRoomService = {
    getAllClassrooms: vi.fn(),
    getClassroomById: vi.fn(),
    createClassroom: vi.fn(),
    updateClassroom: vi.fn(),
    deleteClassroom: vi.fn(),
    validateClassRoomImport: vi.fn(),
    commitClassRoomImport: vi.fn(),
  };
  const controller = createClassRoomController(service);
  const app = new Hono();
  app.get('/classrooms', c => controller.getAllClassrooms(c));
  app.get('/classrooms/:classId', c => controller.getClassroomById(c));
  app.post('/classrooms', c => controller.createClassroom(c));
  app.put('/classrooms/:classId', c => controller.updateClassroom(c));
  app.delete('/classrooms/:classId', c => controller.deleteClassroom(c));
  app.post('/classrooms/master-imports/validate', c =>
    controller.validateClassRoomImport(c)
  );
  app.post('/classrooms/master-imports/commit', c =>
    controller.commitClassRoomImport(c)
  );
  return { app, service };
}

describe('ClassRoomController', () => {
  it('一覧をlimitとoffset付きで返す', async () => {
    const { app, service } = setup();
    (service.getAllClassrooms as ReturnType<typeof vi.fn>).mockResolvedValue({
      classrooms: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    const response = await app.request('/classrooms?limit=10&offset=20');

    expect(response.status).toBe(200);
    expect(service.getAllClassrooms).toHaveBeenCalledWith(10, 20);
  });

  it('不正な一覧パラメータは400を返す', async () => {
    const { app } = setup();
    expect((await app.request('/classrooms?offset=-1')).status).toBe(400);
  });

  it('クラス詳細を返す', async () => {
    const { app, service } = setup();
    (service.getClassroomById as ReturnType<typeof vi.fn>).mockResolvedValue({
      class_room_id: 1,
      class_code: 'IA14A',
      class_name: '高度情報学科AI開発先行コース',
      student_count: 0,
      teacher: null,
    });

    const response = await app.request('/classrooms/1');

    expect(response.status).toBe(200);
    expect(service.getClassroomById).toHaveBeenCalledWith(1);
  });

  it('存在しないクラス詳細は404を返す', async () => {
    const { app, service } = setup();
    (service.getClassroomById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class not found')
    );

    const response = await app.request('/classrooms/999');

    expect(response.status).toBe(404);
  });

  it('担任未設定でクラスを登録できる', async () => {
    const { app, service } = setup();
    (service.createClassroom as ReturnType<typeof vi.fn>).mockResolvedValue({
      class_room_id: 1,
      class_code: 'IA14A',
      class_name: '高度情報学科AI開発先行コース',
      student_count: 0,
      teacher: null,
    });
    const response = await app.request('/classrooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: null,
      }),
    });

    expect(response.status).toBe(201);
    expect(service.createClassroom).toHaveBeenCalledWith({
      class_code: 'IA14A',
      class_name: '高度情報学科AI開発先行コース',
      teacher_id: null,
    });
  });

  it('teacherIdが未指定の登録は400を返す', async () => {
    const { app } = setup();
    const response = await app.request('/classrooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('登録時の担任未存在は404を返す', async () => {
    const { app, service } = setup();
    (service.createClassroom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Teacher not found')
    );

    const response = await app.request('/classrooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: 999,
      }),
    });

    expect(response.status).toBe(404);
  });

  it('登録時のクラスコード重複は409を返す', async () => {
    const { app, service } = setup();
    (service.createClassroom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class code already exists')
    );

    const response = await app.request('/classrooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: null,
      }),
    });

    expect(response.status).toBe(409);
  });

  it('クラスを更新できる', async () => {
    const { app, service } = setup();
    (service.updateClassroom as ReturnType<typeof vi.fn>).mockResolvedValue({
      class_room_id: 1,
      class_code: 'IA14B',
      class_name: '高度情報学科AI開発先行コースB',
      student_count: 0,
      teacher: null,
    });

    const response = await app.request('/classrooms/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: 'IA14B',
        className: '高度情報学科AI開発先行コースB',
        teacherId: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(service.updateClassroom).toHaveBeenCalledWith(1, {
      class_code: 'IA14B',
      class_name: '高度情報学科AI開発先行コースB',
      teacher_id: null,
    });
  });

  it('存在しないクラスの更新は404を返す', async () => {
    const { app, service } = setup();
    (service.updateClassroom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class not found')
    );

    const response = await app.request('/classrooms/999', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: 'IA14B',
        className: '高度情報学科AI開発先行コースB',
        teacherId: null,
      }),
    });

    expect(response.status).toBe(404);
  });

  it('クラスを削除すると204を返す', async () => {
    const { app, service } = setup();
    const response = await app.request('/classrooms/1', { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(service.deleteClassroom).toHaveBeenCalledWith(1);
  });

  it('学生が所属するクラスの削除は409を返す', async () => {
    const { app, service } = setup();
    (service.deleteClassroom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class is referenced by students')
    );

    const response = await app.request('/classrooms/1', { method: 'DELETE' });

    expect(response.status).toBe(409);
  });

  it('存在しないクラスの削除は404を返す', async () => {
    const { app, service } = setup();
    (service.deleteClassroom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class not found')
    );

    const response = await app.request('/classrooms/999', { method: 'DELETE' });

    expect(response.status).toBe(404);
  });

  it('不正なIDは400を返す', async () => {
    const { app } = setup();
    expect((await app.request('/classrooms/nope')).status).toBe(400);
  });

  describe('validateClassRoomImport', () => {
    const validRow = { class_code: '13C', class_name: '3年Cクラス' };

    it('サービスの検査結果をそのまま200で返す', async () => {
      const { app, service } = setup();
      const result = {
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      };
      (
        service.validateClassRoomImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/classrooms/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
      expect(service.validateClassRoomImport).toHaveBeenCalledWith({
        rows: [validRow],
      });
    });

    it('rowsが空配列の場合は400を返す', async () => {
      const { app, service } = setup();

      const res = await app.request('/classrooms/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(service.validateClassRoomImport).not.toHaveBeenCalled();
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, service } = setup();
      (
        service.validateClassRoomImport as ReturnType<typeof vi.fn>
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
      const { app, service } = setup();
      const result = { total: 1, imported: 1, error_count: 0, errors: [] };
      (
        service.commitClassRoomImport as ReturnType<typeof vi.fn>
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
      const { app, service } = setup();
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
        service.commitClassRoomImport as ReturnType<typeof vi.fn>
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
      const { app, service } = setup();

      const res = await app.request('/classrooms/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(service.commitClassRoomImport).not.toHaveBeenCalled();
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, service } = setup();
      (
        service.commitClassRoomImport as ReturnType<typeof vi.fn>
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
