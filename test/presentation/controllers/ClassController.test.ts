import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createClassController } from '../../../src/presentation/controllers/ClassController';
import type { IClassService } from '../../../src/application/services/IClassService';

function setup() {
  const service: IClassService = {
    getAllClassrooms: vi.fn(),
    getClassById: vi.fn(),
    createClass: vi.fn(),
    updateClass: vi.fn(),
    deleteClass: vi.fn(),
  };
  const controller = createClassController(service);
  const app = new Hono();
  app.get('/classrooms', c => controller.getAllClassrooms(c));
  app.get('/classrooms/:classId', c => controller.getClassById(c));
  app.post('/classrooms', c => controller.createClass(c));
  app.put('/classrooms/:classId', c => controller.updateClass(c));
  app.delete('/classrooms/:classId', c => controller.deleteClass(c));
  return { app, service };
}

describe('ClassController', () => {
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
    (service.getClassById as ReturnType<typeof vi.fn>).mockResolvedValue({
      class_room_id: 1,
      class_code: 'IA14A',
      class_name: '高度情報学科AI開発先行コース',
      student_count: 0,
      teacher: null,
    });

    const response = await app.request('/classrooms/1');

    expect(response.status).toBe(200);
    expect(service.getClassById).toHaveBeenCalledWith(1);
  });

  it('存在しないクラス詳細は404を返す', async () => {
    const { app, service } = setup();
    (service.getClassById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class not found')
    );

    const response = await app.request('/classrooms/999');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Class not found',
    });
  });

  it('担任未設定でクラスを登録できる', async () => {
    const { app, service } = setup();
    (service.createClass as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    expect(service.createClass).toHaveBeenCalledWith({
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
    (service.createClass as ReturnType<typeof vi.fn>).mockRejectedValue(
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
    await expect(response.json()).resolves.toEqual({
      error: 'Teacher not found',
    });
  });

  it('登録時のクラスコード重複は409を返す', async () => {
    const { app, service } = setup();
    (service.createClass as ReturnType<typeof vi.fn>).mockRejectedValue(
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
    await expect(response.json()).resolves.toEqual({
      error: 'Class code already exists',
    });
  });

  it('クラスを更新できる', async () => {
    const { app, service } = setup();
    (service.updateClass as ReturnType<typeof vi.fn>).mockResolvedValue({
      class_room_id: 1,
      class_code: '11B',
      class_name: '1年B組',
      student_count: 0,
      teacher: null,
    });

    const response = await app.request('/classrooms/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: '11B',
        className: '1年B組',
        teacherId: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(service.updateClass).toHaveBeenCalledWith(1, {
      class_code: '11B',
      class_name: '1年B組',
      teacher_id: null,
    });
  });

  it('存在しないクラスの更新は404を返す', async () => {
    const { app, service } = setup();
    (service.updateClass as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class not found')
    );

    const response = await app.request('/classrooms/999', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: '11B',
        className: '1年B組',
        teacherId: null,
      }),
    });

    expect(response.status).toBe(404);
  });

  it('クラスを削除すると204を返す', async () => {
    const { app, service } = setup();

    const response = await app.request('/classrooms/1', { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(service.deleteClass).toHaveBeenCalledWith(1);
  });

  it('学生が所属するクラスの削除は409を返す', async () => {
    const { app, service } = setup();
    (service.deleteClass as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Class is referenced by students')
    );

    const response = await app.request('/classrooms/1', { method: 'DELETE' });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Class is referenced by students',
    });
  });

  it('存在しないクラスの削除は404を返す', async () => {
    const { app, service } = setup();
    (service.deleteClass as ReturnType<typeof vi.fn>).mockRejectedValue(
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
