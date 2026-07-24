import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IEventScheduleService } from '../../../src/application/services/IEventScheduleService';
import { createEventScheduleController } from '../../../src/presentation/controllers/EventScheduleController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

function setup() {
  const service: IEventScheduleService = {
    updateEventSchedule: vi.fn().mockResolvedValue({ ok: true }),
  };
  const controller = createEventScheduleController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set(
      'authenticatedUserId',
      c.req.header('Cookie') === 'session=session-id' ? 7 : null
    );
    await next();
  });
  app.put('/events/:eventId/schedule', c => controller.updateEventSchedule(c));
  const bindings = {
    EVENT_DATE: '2026-11-07',
  } as Env;
  return { app, service, bindings };
}

const validBody = {
  startTime: '1030',
  endTime: '1100',
  notificationEnabled: true,
};

describe('EventScheduleController', () => {
  it('セッションのuser_idとEVENT_DATEを使って更新する', async () => {
    const { app, service, bindings } = setup();
    const response = await app.request(
      '/events/1/schedule',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=session-id',
        },
        body: JSON.stringify(validBody),
      },
      bindings
    );

    expect(response.status).toBe(200);
    expect(service.updateEventSchedule).toHaveBeenCalledWith({
      event_id: 1,
      user_id: 7,
      start_time: '1030',
      end_time: '1100',
      notification_enabled: true,
      event_date: '2026-11-07',
    });
  });

  it('セッションがない場合は401を返し、userIdをリクエストから受け取らない', async () => {
    const { app, service, bindings } = setup();
    const response = await app.request(
      '/events/1/schedule',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validBody, userId: 999 }),
      },
      bindings
    );

    expect(response.status).toBe(401);
    expect(service.updateEventSchedule).not.toHaveBeenCalled();
  });

  it.each([
    { ...validBody, startTime: '10:30' },
    { ...validBody, startTime: '1060' },
    { ...validBody, startTime: '1100', endTime: '1030' },
  ])('不正なHHMMまたは時刻順では400を返す', async body => {
    const { app, service, bindings } = setup();
    const response = await app.request(
      '/events/1/schedule',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=session-id',
        },
        body: JSON.stringify(body),
      },
      bindings
    );

    expect(response.status).toBe(400);
    expect(service.updateEventSchedule).not.toHaveBeenCalled();
  });

  it('EVENT_DATEが未設定の場合は500を返す', async () => {
    const { app, service, bindings } = setup();
    const response = await app.request(
      '/events/1/schedule',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=session-id',
        },
        body: JSON.stringify(validBody),
      },
      { ...bindings, EVENT_DATE: undefined }
    );

    expect(response.status).toBe(500);
    expect(service.updateEventSchedule).not.toHaveBeenCalled();
  });

  it('更新権限がないユーザーには403を返す', async () => {
    const { app, service, bindings } = setup();
    (service.updateEventSchedule as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Schedule update forbidden')
    );

    const response = await app.request(
      '/events/1/schedule',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=session-id',
        },
        body: JSON.stringify(validBody),
      },
      bindings
    );

    expect(response.status).toBe(403);
  });
});
