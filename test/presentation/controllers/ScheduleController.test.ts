import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IScheduleService } from '../../../src/application/services/IScheduleService';
import { createScheduleController } from '../../../src/presentation/controllers/ScheduleController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/sessionAuthentication';

function setup() {
  const service: IScheduleService = {
    getAllSchedules: vi.fn(),
    getScheduleById: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
  };
  const controller = createScheduleController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthenticationVariables;
  }>();
  app.get('/notification/schedules', c => controller.getAllSchedules(c));
  app.get('/notification/schedules/:notificationId', c =>
    controller.getScheduleById(c)
  );
  app.post('/notification/schedules', c => controller.createSchedule(c));
  app.put('/notification/schedules/:notificationId', c =>
    controller.updateSchedule(c)
  );
  const bindings = {} as Env;
  return { app, service, bindings };
}

const validBody = {
  user_id: 1,
  event_id: 2,
  importance: 2,
  send_at: '2026-07-23T09:00:00.000Z',
  gathering_id: 3,
};

const scheduleEntity = {
  notification_schedules: [
    {
      notification_id: 4,
      notification_type: 'manual',
      title: '件名',
      body: '本文',
      created_user: { user_id: 1, user_name: '作成者' },
      event: {
        event_id: 2,
        event_name: '大縄跳び',
        start_time: '0900',
        end_time: '1000',
      },
      send_time: '2026-07-23T09:00:00.000Z',
      delivery_summary: { total: 1, draft: 1, sending: 0, sent: 0, failed: 0 },
    },
  ],
};

describe('ScheduleController', () => {
  it('スケジュール一覧を返す', async () => {
    const { app, service, bindings } = setup();
    (service.getAllSchedules as ReturnType<typeof vi.fn>).mockResolvedValue(
      scheduleEntity
    );

    const response = await app.request('/notification/schedules', {}, bindings);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(scheduleEntity);
  });

  it('サービスが失敗した場合は500を返す', async () => {
    const { app, service, bindings } = setup();
    (service.getAllSchedules as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('failure')
    );

    const response = await app.request('/notification/schedules', {}, bindings);

    expect(response.status).toBe(500);
  });

  it('通知IDに対応するスケジュールを返す', async () => {
    const { app, service, bindings } = setup();
    (service.getScheduleById as ReturnType<typeof vi.fn>).mockResolvedValue(
      scheduleEntity
    );

    const response = await app.request(
      '/notification/schedules/4',
      {},
      bindings
    );

    expect(response.status).toBe(200);
    expect(service.getScheduleById).toHaveBeenCalledWith(4);
    expect(await response.json()).toEqual(scheduleEntity);
  });

  it('不正な通知IDでは400を返す', async () => {
    const { app, service, bindings } = setup();

    const response = await app.request(
      '/notification/schedules/abc',
      {},
      bindings
    );

    expect(response.status).toBe(400);
    expect(service.getScheduleById).not.toHaveBeenCalled();
  });

  it('存在しない通知IDでは404を返す', async () => {
    const { app, service, bindings } = setup();
    (service.getScheduleById as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const response = await app.request(
      '/notification/schedules/999',
      {},
      bindings
    );

    expect(response.status).toBe(404);
  });

  it('スケジュールを作成する', async () => {
    const { app, service, bindings } = setup();
    const createBody = {
      user_id: 1,
      event_id: 2,
      notification_id: 3,
      importance: 2,
      send_at: '2026-07-23T09:00:00.000Z',
    };
    const created = { ...createBody, firebase_token_id: 9 };
    (service.createSchedule as ReturnType<typeof vi.fn>).mockResolvedValue(
      created
    );

    const response = await app.request(
      '/notification/schedules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createBody),
      },
      bindings
    );

    expect(response.status).toBe(201);
    expect(service.createSchedule).toHaveBeenCalledWith(createBody);
    expect(await response.json()).toEqual(created);
  });

  it('不正なスケジュールデータでは400を返す', async () => {
    const { app, service, bindings } = setup();

    const response = await app.request(
      '/notification/schedules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 1 }),
      },
      bindings
    );

    expect(response.status).toBe(400);
    expect(service.createSchedule).not.toHaveBeenCalled();
  });

  it('通知IDと更新内容を受けて更新する', async () => {
    const { app, service, bindings } = setup();
    (service.updateSchedule as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...validBody,
    });

    const response = await app.request(
      '/notification/schedules/4',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      },
      bindings
    );

    expect(response.status).toBe(200);
    expect(service.updateSchedule).toHaveBeenCalledWith(4, validBody);
  });

  it('不正なJSONでも500ではなく400を返す', async () => {
    const { app, service, bindings } = setup();

    const response = await app.request(
      '/notification/schedules/4',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      },
      bindings
    );

    expect(response.status).toBe(400);
    expect(service.updateSchedule).not.toHaveBeenCalled();
  });
});
