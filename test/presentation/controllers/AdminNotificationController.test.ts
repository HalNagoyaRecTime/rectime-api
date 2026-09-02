import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IAdminNotificationService } from '../../../src/application/services/IAdminNotificationService';
import type { Env } from '../../../src/lib/env';
import { createAdminNotificationController } from '../../../src/presentation/controllers/AdminNotificationController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

function setup() {
  const service: IAdminNotificationService = {
    createManualNotification: vi.fn().mockResolvedValue({
      notification_id: 10,
      notification_type: 'manual',
      title: '集合場所のお知らせ',
      body: '体育館前へ集合してください。',
      audience: { type: 'all' },
      scheduled_at: '2026-07-23T09:00:00+09:00',
      schedule_count: 2,
      send_status: 'draft',
      importance: 2,
      created_user_id: 1,
    }),
  };
  const controller = createAdminNotificationController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set(
      'authenticatedUserId',
      c.req.header('Cookie')?.includes('session=session-id') ? 1 : null
    );
    await next();
  });
  app.post('/admin/notifications', c => controller.createManualNotification(c));
  const request = async (
    body: unknown,
    authenticated = true,
    bindings = { EVENT_DATE: '2026-07-23' } as Env
  ): Promise<Response> =>
    await app.request(
      '/admin/notifications',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authenticated ? { Cookie: 'session=session-id' } : {}),
        },
        body: JSON.stringify(body),
      },
      bindings
    );
  return { service, request };
}

const validBody = {
  title: '集合場所のお知らせ',
  body: '体育館前へ集合してください。',
  audience: { type: 'all' },
  scheduledAt: '2026-07-23T09:00:00+09:00',
};

describe('AdminNotificationController', () => {
  it('全体向け手動通知を作成して201を返す', async () => {
    const { service, request } = setup();

    const response = await request(validBody);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      notification_id: 10,
      schedule_count: 2,
      importance: 2,
    });
    expect(service.createManualNotification).toHaveBeenCalledWith({
      created_user_id: 1,
      title: validBody.title,
      body: validBody.body,
      audience: { type: 'all' },
      scheduled_at: validBody.scheduledAt,
    });
  });

  it.each([
    [
      { type: 'class_room', classRoomId: 2 },
      { type: 'class_room', class_room_id: 2 },
    ],
    [
      { type: 'gathering', gatheringId: 3 },
      { type: 'gathering', gathering_id: 3 },
    ],
    [
      { type: 'event_participants', eventId: 4 },
      { type: 'event_participants', event_id: 4 },
    ],
  ])('対象%sをDomain形式へ変換する', async (audience, expected) => {
    const { service, request } = setup();

    const response = await request({ ...validBody, audience });

    expect(response.status).toBe(201);
    expect(service.createManualNotification).toHaveBeenCalledWith(
      expect.objectContaining({ audience: expected })
    );
  });

  it('未認証なら401を返す', async () => {
    const { service, request } = setup();

    const response = await request(validBody, false);

    expect(response.status).toBe(401);
    expect(service.createManualNotification).not.toHaveBeenCalled();
  });

  it('EVENT_DATEと異なるJST日付のscheduledAtは400を返す', async () => {
    const { service, request } = setup();

    const response = await request({
      ...validBody,
      scheduledAt: '2026-07-24T00:00:00+09:00',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'scheduledAt must be on EVENT_DATE',
      code: 'INVALID_NOTIFICATION_DATE',
    });
    expect(service.createManualNotification).not.toHaveBeenCalled();
  });

  it('EVENT_DATEが未設定または不正な場合は500を返す', async () => {
    const { service, request } = setup();

    const response = await request(validBody, true, {} as Env);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'EVENT_DATE is not configured correctly',
    });
    expect(service.createManualNotification).not.toHaveBeenCalled();
  });

  it.each([
    { ...validBody, title: ' ' },
    { ...validBody, scheduledAt: '2026-07-23 09:00' },
    { ...validBody, audience: { type: 'class_room' } },
    {
      ...validBody,
      audience: { type: 'all', firebaseTokenId: 1 },
    },
  ])('不正なRequestでは400を返す', async body => {
    const { service, request } = setup();

    const response = await request(body);

    expect(response.status).toBe(400);
    expect(service.createManualNotification).not.toHaveBeenCalled();
  });

  it.each([
    ['Notification audience not found', 404],
    ['Notification audience has no active Firebase tokens', 409],
  ] as const)('%sをHTTP %sへ変換する', async (message, status) => {
    const { service, request } = setup();
    (
      service.createManualNotification as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error(message));

    const response = await request(validBody);

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
  });
});
