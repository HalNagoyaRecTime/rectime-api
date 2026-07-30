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

describe('ScheduleController', () => {
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

  it('camelCaseのボディでも更新できる', async () => {
    const { app, service, bindings } = setup();
    (service.updateSchedule as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...validBody,
    });

    const camelCaseBody = {
      userId: 1,
      eventId: 2,
      importance: 2,
      sendAt: '2026-07-23T09:00:00.000Z',
      gatheringId: 3,
    };

    const response = await app.request(
      '/notification/schedules/4',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(camelCaseBody),
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
