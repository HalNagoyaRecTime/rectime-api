import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { INotificationScheduleService } from '../../../src/application/services/INotificationScheduleService';
import { createNotificationScheduleController } from '../../../src/presentation/controllers/NotificationScheduleController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

const schedule = {
  notification_schedule_id: 1,
  created_user_id: 1,
  event_id: 2,
  notification_id: 4,
  firebase_token_id: 9,
  importance: 2,
  notification_type: 'manual',
  title: '集合場所のお知らせ',
  body: '第1体育館へ集合してください。',
  send_status: 'draft' as const,
  fcm_message_id: null,
  failed_reason: null,
  send_at: '2026-07-23T09:00:00.000Z',
  created_at: '2026-07-20T09:00:00.000Z',
  updated_at: '2026-07-20T09:00:00.000Z',
};

function setup() {
  const service: INotificationScheduleService = {
    canManageNotificationSchedules: vi.fn().mockResolvedValue(true),
    getAllNotificationSchedules: vi.fn(),
    getNotificationScheduleById: vi.fn(),
    createNotificationSchedule: vi.fn(),
    deleteNotificationSchedule: vi.fn(),
  };
  const controller = createNotificationScheduleController(service);
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
  app.get('/notification-schedules', c =>
    controller.getAllNotificationSchedules(c)
  );
  app.post('/notification-schedules', c =>
    controller.createNotificationSchedule(c)
  );
  app.get('/notification-schedules/:id', c =>
    controller.getNotificationScheduleById(c)
  );
  app.delete('/notification-schedules/:id', c =>
    controller.deleteNotificationSchedule(c)
  );
  const bindings = {} as Env;
  const authorizedRequest = async (
    path: string,
    init: RequestInit = {}
  ): Promise<Response> =>
    await app.request(
      path,
      {
        ...init,
        headers: {
          Cookie: 'session=session-id',
          ...Object.fromEntries(new Headers(init.headers).entries()),
        },
      },
      bindings
    );
  return { app, service, bindings, authorizedRequest };
}

describe('NotificationScheduleController', () => {
  it('一覧条件と平面ページネーションを返す', async () => {
    const { service, authorizedRequest } = setup();
    (
      service.getAllNotificationSchedules as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ notification_schedules: [schedule], total: 1 });

    const response = await authorizedRequest(
      '/notification-schedules?sendStatus=draft&eventId=2&createdUserId=1&firebaseTokenId=9&from=2026-07-23T08%3A00%3A00.000Z&to=2026-07-23T10%3A00%3A00.000Z&limit=20&offset=10'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notification_schedules: [schedule],
      total: 1,
      limit: 20,
      offset: 10,
    });
    expect(service.getAllNotificationSchedules).toHaveBeenCalledWith({
      send_status: 'draft',
      event_id: 2,
      created_user_id: 1,
      firebase_token_id: 9,
      from: '2026-07-23T08:00:00.000Z',
      to: '2026-07-23T10:00:00.000Z',
      limit: 20,
      offset: 10,
    });
  });

  it('一覧のlimitとoffsetにデフォルト値を使う', async () => {
    const { service, authorizedRequest } = setup();
    (
      service.getAllNotificationSchedules as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ notification_schedules: [], total: 0 });

    const response = await authorizedRequest('/notification-schedules');

    expect(response.status).toBe(200);
    expect(service.getAllNotificationSchedules).toHaveBeenCalledWith({
      send_status: undefined,
      event_id: undefined,
      created_user_id: undefined,
      firebase_token_id: undefined,
      from: undefined,
      to: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it.each([
    '/notification-schedules?sendStatus=canceled',
    '/notification-schedules?eventId=0',
    '/notification-schedules?limit=101',
    '/notification-schedules?from=2026-07-24T00%3A00%3A00.000Z&to=2026-07-23T00%3A00%3A00.000Z',
  ])('不正な一覧条件%sは400を返す', async url => {
    const { service, authorizedRequest } = setup();

    const response = await authorizedRequest(url);

    expect(response.status).toBe(400);
    expect(service.getAllNotificationSchedules).not.toHaveBeenCalled();
  });

  it('通知予定を作成して201を返す', async () => {
    const { service, authorizedRequest } = setup();
    (
      service.createNotificationSchedule as ReturnType<typeof vi.fn>
    ).mockResolvedValue(schedule);

    const response = await authorizedRequest('/notification-schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session=session-id',
      },
      body: JSON.stringify({
        eventId: 2,
        notificationId: 4,
        firebaseTokenId: 9,
        importance: 2,
        sendAt: '2026-07-23T09:00:00.000Z',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(schedule);
    expect(service.createNotificationSchedule).toHaveBeenCalledWith({
      created_user_id: 1,
      event_id: 2,
      notification_id: 4,
      firebase_token_id: 9,
      importance: 2,
      send_at: '2026-07-23T09:00:00.000Z',
    });
  });

  it('セッションがない場合は401を返す', async () => {
    const { app, service, bindings } = setup();
    const response = await app.request(
      '/notification-schedules',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: 4,
          firebaseTokenId: 9,
          sendAt: '2026-07-23T09:00:00.000Z',
        }),
      },
      bindings
    );
    expect(response.status).toBe(401);
    expect(service.createNotificationSchedule).not.toHaveBeenCalled();
  });

  it('staffsまたはteachersではないユーザーには403を返す', async () => {
    const { service, authorizedRequest } = setup();
    (
      service.canManageNotificationSchedules as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);

    const response = await authorizedRequest('/notification-schedules');

    expect(response.status).toBe(403);
    expect(service.getAllNotificationSchedules).not.toHaveBeenCalled();
  });

  it('重要度2以外は400を返す', async () => {
    const { service, authorizedRequest } = setup();

    const response = await authorizedRequest('/notification-schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session=session-id',
      },
      body: JSON.stringify({
        eventId: 2,
        notificationId: 4,
        firebaseTokenId: 9,
        importance: 1,
        sendAt: '2026-07-23T09:00:00.000Z',
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createNotificationSchedule).not.toHaveBeenCalled();
  });

  it('通知予定詳細を返す', async () => {
    const { service, authorizedRequest } = setup();
    (
      service.getNotificationScheduleById as ReturnType<typeof vi.fn>
    ).mockResolvedValue(schedule);

    const response = await authorizedRequest('/notification-schedules/1');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(schedule);
  });

  it('存在しない通知予定詳細は404を返す', async () => {
    const { service, authorizedRequest } = setup();
    (
      service.getNotificationScheduleById as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Notification schedule not found'));

    const response = await authorizedRequest('/notification-schedules/999');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'NOTIFICATION_SCHEDULE_NOT_FOUND',
        message: '通知スケジュールが見つかりません',
      },
    });
  });

  it('draftの通知予定を削除して204を返す', async () => {
    const { service, authorizedRequest } = setup();
    (
      service.deleteNotificationSchedule as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);

    const response = await authorizedRequest('/notification-schedules/1', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it.each([
    [
      'Notification schedule not found',
      404,
      'NOTIFICATION_SCHEDULE_NOT_FOUND',
      '通知スケジュールが見つかりません',
    ],
    [
      'Only draft notification schedules can be deleted',
      409,
      'NOTIFICATION_SCHEDULE_NOT_DRAFT',
      '下書き状態の通知スケジュールのみ削除できます',
    ],
  ] as const)(
    '削除エラー%sを%sで返す',
    async (message, status, code, responseMessage) => {
      const { service, authorizedRequest } = setup();
      (
        service.deleteNotificationSchedule as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error(message));

      const response = await authorizedRequest('/notification-schedules/1', {
        method: 'DELETE',
      });

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        error: {
          code,
          message: responseMessage,
        },
      });
    }
  );

  it('不正な通知予定IDは400を返す', async () => {
    const { service, authorizedRequest } = setup();

    const response = await authorizedRequest('/notification-schedules/invalid');

    expect(response.status).toBe(400);
    expect(service.getNotificationScheduleById).not.toHaveBeenCalled();
  });
});
