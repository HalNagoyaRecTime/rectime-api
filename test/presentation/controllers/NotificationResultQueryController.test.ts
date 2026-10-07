import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { INotificationResultQueryService } from '../../../src/application/services/INotificationResultQueryService';
import type { Env } from '../../../src/lib/env';
import { createNotificationResultQueryController } from '../../../src/presentation/controllers/NotificationResultQueryController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

const results = {
  notificationScheduleId: 9,
  recipients: {
    items: [],
    pagination: { page: 1, limit: 50, totalCount: 0, totalPages: 0 },
  },
};
const detail = {
  notificationPushDeliveryId: 30,
  notificationRecipientId: 20,
  firebaseTokenId: null,
  platform: 'ios' as const,
  status: 'stopped' as const,
  attemptCount: 2,
  firstAttemptAt: '2026-07-23T00:00:00.000Z',
  lastAttemptAt: '2026-07-23T00:01:00.000Z',
  nextRetryAt: null,
  sentAt: null,
  failedReason: 'stopped',
  fcmMessageId: null,
};

function setup() {
  const service: INotificationResultQueryService = {
    getScheduleResults: vi.fn().mockResolvedValue(results),
    getPushDeliveryDetail: vi.fn().mockResolvedValue(detail),
  };
  const controller = createNotificationResultQueryController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.get('/admin/notifications/schedules/:notificationScheduleId/results', c =>
    controller.getScheduleResults(c)
  );
  app.get(
    '/admin/notifications/push-deliveries/:notificationPushDeliveryId',
    c => controller.getPushDeliveryDetail(c)
  );
  return {
    service,
    request: (path: string) => app.request(path, {}, {} as Env),
  };
}

describe('NotificationResultQueryController', () => {
  it('Resultsを共通Response DTOで返し、pageとlimitを渡す', async () => {
    const { service, request } = setup();
    const response = await request(
      '/admin/notifications/schedules/9/results?page=2&limit=10'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(results);
    expect(service.getScheduleResults).toHaveBeenCalledWith(9, {
      page: 2,
      limit: 10,
    });
  });

  it('pageとlimitの既定値を利用する', async () => {
    const { service, request } = setup();
    await request('/admin/notifications/schedules/9/results');

    expect(service.getScheduleResults).toHaveBeenCalledWith(9, {
      page: 1,
      limit: 50,
    });
  });

  it.each([
    '/admin/notifications/schedules/nope/results',
    '/admin/notifications/schedules/9/results?page=0',
    '/admin/notifications/schedules/9/results?limit=101',
  ])('不正なResults条件%sは400を返す', async path => {
    const { service, request } = setup();
    const response = await request(path);

    expect(response.status).toBe(400);
    expect(service.getScheduleResults).not.toHaveBeenCalled();
  });

  it('Scheduleがない場合は404を返す', async () => {
    const { service, request } = setup();
    (service.getScheduleResults as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );
    const response = await request(
      '/admin/notifications/schedules/999/results'
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOTIFICATION_SCHEDULE_NOT_FOUND' },
    });
  });

  it('Push Delivery詳細を返し、なければ404にする', async () => {
    const { service, request } = setup();
    const found = await request('/admin/notifications/push-deliveries/30');
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(detail);
    expect(service.getPushDeliveryDetail).toHaveBeenCalledWith(30);

    (
      service.getPushDeliveryDetail as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    const missing = await request('/admin/notifications/push-deliveries/404');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'NOTIFICATION_PUSH_DELIVERY_NOT_FOUND' },
    });
  });

  it('Repository errorを500にする', async () => {
    const { service, request } = setup();
    (
      service.getPushDeliveryDetail as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('database error'));
    const response = await request('/admin/notifications/push-deliveries/30');

    expect(response.status).toBe(500);
  });
});
