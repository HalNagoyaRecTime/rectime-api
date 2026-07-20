import type { KVNamespace } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IEventScheduleService } from '../../../src/application/services/IEventScheduleService';
import { createEventScheduleController } from '../../../src/presentation/controllers/EventScheduleController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';

function setup() {
  const service: IEventScheduleService = {
    updateEventSchedule: vi.fn().mockResolvedValue({ ok: true }),
  };
  const controller = createEventScheduleController(service);
  const app = new Hono<{ Bindings: Env; Variables: ContainerVariables }>();
  app.put('/events/:eventId', c => controller.updateEventSchedule(c));
  const session = {
    user_id: '7',
    oid: 'oid',
    tid: 'tid',
    sub: 'sub',
    email: 'admin@example.com',
    display_name: '管理者',
    expires_at: '2099-01-01T00:00:00.000Z',
  };
  const kv = {
    get: vi.fn().mockResolvedValue(JSON.stringify(session)),
  } as unknown as KVNamespace;
  const bindings = {
    AUTH_KV: kv,
    EVENT_DATE: '2026-11-07',
  } as Env;
  return { app, service, bindings };
}

const validBody = {
  startTime: '1030',
  endTime: '1100',
  gatheringGroupId: 3,
  notificationEnabled: true,
};

describe('EventScheduleController', () => {
  it('セッションのuser_idとEVENT_DATEを使って更新する', async () => {
    const { app, service, bindings } = setup();
    const response = await app.request(
      '/events/1',
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
      gathering_group_id: 3,
      start_time: '1030',
      end_time: '1100',
      notification_enabled: true,
      event_date: '2026-11-07',
    });
  });

  it('セッションがない場合は401を返し、userIdをリクエストから受け取らない', async () => {
    const { app, service, bindings } = setup();
    const response = await app.request(
      '/events/1',
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
      '/events/1',
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
      '/events/1',
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
});
