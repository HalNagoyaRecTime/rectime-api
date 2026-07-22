import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createClassController } from '../../../src/presentation/controllers/ClassController';
import type { IClassService } from '../../../src/application/services/IClassService';

function setup() {
  const service: IClassService = {
    getAllClasses: vi.fn(),
    getClassById: vi.fn(),
    createClass: vi.fn(),
    updateClass: vi.fn(),
    deleteClass: vi.fn(),
  };
  const controller = createClassController(service);
  const app = new Hono();
  app.get('/classes', c => controller.getAllClasses(c));
  app.get('/classes/:classId', c => controller.getClassById(c));
  app.post('/classes', c => controller.createClass(c));
  app.put('/classes/:classId', c => controller.updateClass(c));
  app.delete('/classes/:classId', c => controller.deleteClass(c));
  return { app, service };
}

describe('ClassController', () => {
  it('一覧をページ情報付きで返す', async () => {
    const { app, service } = setup();
    (service.getAllClasses as ReturnType<typeof vi.fn>).mockResolvedValue({
      classes: [],
      total: 0,
      page: 1,
      limit: 20,
      total_pages: 0,
    });
    expect((await app.request('/classes')).status).toBe(200);
  });

  it('担任未設定でクラスを登録できる', async () => {
    const { app, service } = setup();
    (service.createClass as ReturnType<typeof vi.fn>).mockResolvedValue({
      class_room_id: 1,
      class_code: '11A',
      name: '1年A組',
      student_count: 0,
      teacher: null,
    });
    const response = await app.request('/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classCode: '11A',
        className: '1年A組',
        teacherId: null,
      }),
    });
    expect(response.status).toBe(201);
    expect(service.createClass).toHaveBeenCalledWith({
      class_code: '11A',
      name: '1年A組',
      teacher_id: null,
    });
  });

  it('不正なIDは400を返す', async () => {
    const { app } = setup();
    expect((await app.request('/classes/nope')).status).toBe(400);
  });
});
