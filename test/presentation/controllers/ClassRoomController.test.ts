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
  return { app, service };
}

describe('ClassRoomController', () => {
  it('一覧をlimitとoffset付きで返す', async () => {
    const { app, service } = setup();
    (service.getAllClassrooms as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    const response = await app.request('/classrooms?limit=10&offset=20');

    expect(response.status).toBe(200);
    expect(service.getAllClassrooms).toHaveBeenCalledWith({
      sortBy: 'classRoomId',
      sortOrder: 'asc',
      limit: 10,
      offset: 20,
    });
    expect(await response.json()).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
  });

  it.each([
    'sortBy=invalid',
    'sortOrder=invalid',
    'limit=101',
    'offset=-1',
    'page=2',
    'teacherId=1',
    'userName=%E5%B1%B1%E7%94%B0',
  ])('不正な一覧パラメータ(%s)はVALIDATION_ERRORを返す', async query => {
    const { app } = setup();
    const response = await app.request(`/classrooms?${query}`);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('一覧クエリ未指定時は契約上のデフォルトをサービスへ渡す', async () => {
    const { app, service } = setup();
    (service.getAllClassrooms as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    const response = await app.request('/classrooms');

    expect(response.status).toBe(200);
    expect(service.getAllClassrooms).toHaveBeenCalledWith({
      sortBy: 'classRoomId',
      sortOrder: 'asc',
      limit: 50,
      offset: 0,
    });
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
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      teacherId: null,
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

  it('旧snake_case入力は400を返す', async () => {
    const { app, service } = setup();
    const response = await app.request('/classrooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_code: 'IA14A',
        class_name: '高度情報学科AI開発先行コース',
        teacher_id: null,
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createClassroom).not.toHaveBeenCalled();
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
      classCode: 'IA14B',
      className: '高度情報学科AI開発先行コースB',
      teacherId: null,
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
});
