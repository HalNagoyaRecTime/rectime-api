import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createClassRoomController } from '../../../src/presentation/controllers/ClassRoomController';
import type { IClassRoomService } from '../../../src/application/services/IClassRoomService';
import {
  classIdParams,
  classRoomListQuery,
  classRoomListRoute,
  classRoomWriteSchema,
} from '../../../src/presentation/openapi/classrooms';
import { UserErrors } from '../../../src/presentation/errors/userErrors';

function setup() {
  const service: IClassRoomService = {
    getAllClassRooms: vi.fn(),
    getClassRoomById: vi.fn(),
    createClassRoom: vi.fn(),
    updateClassRoom: vi.fn(),
    deleteClassRoom: vi.fn(),
    validateClassRoomImport: vi.fn(),
    commitClassRoomImport: vi.fn(),
  };
  const controller = createClassRoomController(service);
  const app = new Hono();
  app.get('/classrooms', c => controller.getAllClassRooms(c));
  app.get('/classrooms/:classId', c => controller.getClassRoomById(c));
  app.post('/classrooms', c => controller.createClassRoom(c));
  app.put('/classrooms/:classId', c => controller.updateClassRoom(c));
  app.delete('/classrooms/:classId', c => controller.deleteClassRoom(c));
  return { app, service };
}

describe('ClassRoomController', () => {
  it('一覧をlimitとoffset付きで返す', async () => {
    const { app, service } = setup();
    (service.getAllClassRooms as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    const response = await app.request('/classrooms?limit=10&offset=20');

    expect(response.status).toBe(200);
    expect(service.getAllClassRooms).toHaveBeenCalledWith({
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
    'limit=1e2',
    'limit=1.0',
    'offset=-1',
    'offset=1e1',
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
    (service.getAllClassRooms as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    const response = await app.request('/classrooms');

    expect(response.status).toBe(200);
    expect(service.getAllClassRooms).toHaveBeenCalledWith({
      sortBy: 'classRoomId',
      sortOrder: 'asc',
      limit: 50,
      offset: 0,
    });
  });

  it('クラス詳細を返す', async () => {
    const { app, service } = setup();
    (service.getClassRoomById as ReturnType<typeof vi.fn>).mockResolvedValue({
      class_room_id: 1,
      class_code: 'IA14A',
      class_name: '高度情報学科AI開発先行コース',
      student_count: 0,
      teacher: null,
    });

    const response = await app.request('/classrooms/1');

    expect(response.status).toBe(200);
    expect(service.getClassRoomById).toHaveBeenCalledWith(1);
  });

  it('存在しないクラス詳細は404を返す', async () => {
    const { app, service } = setup();
    (service.getClassRoomById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class not found')
    );

    const response = await app.request('/classrooms/999');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'CLASS_ROOM_NOT_FOUND',
        message: '指定されたクラスが見つかりません',
      },
    });
  });

  it('担任未設定でクラスを登録できる', async () => {
    const { app, service } = setup();
    (service.createClassRoom as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    expect(service.createClassRoom).toHaveBeenCalledWith({
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
    expect(service.createClassRoom).not.toHaveBeenCalled();
  });

  it('登録時の担任未存在は404を返す', async () => {
    const { app, service } = setup();
    (service.createClassRoom as ReturnType<typeof vi.fn>).mockRejectedValue(
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
    (service.createClassRoom as ReturnType<typeof vi.fn>).mockRejectedValue(
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
    (service.updateClassRoom as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    expect(service.updateClassRoom).toHaveBeenCalledWith(1, {
      classCode: 'IA14B',
      className: '高度情報学科AI開発先行コースB',
      teacherId: null,
    });
  });

  it('存在しないクラスの更新は404を返す', async () => {
    const { app, service } = setup();
    (service.updateClassRoom as ReturnType<typeof vi.fn>).mockRejectedValue(
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
    expect(await response.json()).toEqual({
      error: {
        code: 'CLASS_ROOM_NOT_FOUND',
        message: '指定されたクラスが見つかりません',
      },
    });
  });

  it('OpenAPI request schemaはstrict/default/digits-only契約を共有する', () => {
    expect(classRoomListRoute.request?.query).toBe(classRoomListQuery);
    expect(classRoomListQuery.parse({})).toEqual({
      sortBy: 'classRoomId',
      sortOrder: 'asc',
      limit: 50,
      offset: 0,
    });
    expect(classRoomListQuery.safeParse({ limit: '1e2' }).success).toBe(false);
    expect(
      classRoomWriteSchema.safeParse({
        classCode: 'A01',
        className: 'Class A',
        teacherId: 1,
        legacyField: true,
      }).success
    ).toBe(false);
    expect(classIdParams.safeParse({ classId: '01' }).success).toBe(false);
  });

  it('更新時のクラスコード重複は409を返す', async () => {
    const { app, service } = setup();
    (service.updateClassRoom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class code already exists')
    );

    const response = await app.request('/classrooms/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: null,
      }),
    });

    expect(response.status).toBe(409);
  });

  it('クラスを削除すると204を返す', async () => {
    const { app, service } = setup();
    const response = await app.request('/classrooms/1', { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(service.deleteClassRoom).toHaveBeenCalledWith(1);
  });

  it('学生が所属するクラスの削除は409を返す', async () => {
    const { app, service } = setup();
    (service.deleteClassRoom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class is referenced by students')
    );

    const response = await app.request('/classrooms/1', { method: 'DELETE' });

    expect(response.status).toBe(409);
  });

  it('存在しないクラスの削除は404を返す', async () => {
    const { app, service } = setup();
    (service.deleteClassRoom as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class not found')
    );

    const response = await app.request('/classrooms/999', { method: 'DELETE' });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'CLASS_ROOM_NOT_FOUND',
        message: '指定されたクラスが見つかりません',
      },
    });
  });

  it('不正なIDは400を返す', async () => {
    const { app } = setup();
    expect((await app.request('/classrooms/nope')).status).toBe(400);
  });

  it('旧ClassRoom error定数を公開せずcanonical定数だけを使う', () => {
    expect(UserErrors.CLASS_ROOM_NOT_FOUND).toEqual({
      status: 404,
      code: 'CLASS_ROOM_NOT_FOUND',
      message: '指定されたクラスが見つかりません',
    });
    expect(UserErrors).not.toHaveProperty('CLASS_NOT_FOUND');
    expect(UserErrors).not.toHaveProperty('STUDENT_CLASS_ROOM_NOT_FOUND');
    expect(UserErrors).not.toHaveProperty('CLASS_CODE_ALREADY_EXISTS');
    expect(UserErrors).not.toHaveProperty('CLASS_LIST_FAILED');
    expect(UserErrors).not.toHaveProperty('CLASS_FETCH_FAILED');
    expect(UserErrors).not.toHaveProperty('CLASS_CREATE_FAILED');
    expect(UserErrors).not.toHaveProperty('CLASS_UPDATE_FAILED');
    expect(UserErrors).not.toHaveProperty('CLASS_DELETE_FAILED');
  });
});
