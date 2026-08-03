import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IScheduleService } from '../../../src/application/services/IScheduleService';
import { createScheduleController } from '../../../src/presentation/controllers/ScheduleController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';

function setup() {
  const service: IScheduleService = {
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
  create_user_id: 1,
  new_event_id: 2,
  new_importance: 2,
  new_send_at: '2026-07-23T09:00:00.000Z',
  new_gathering_id: 3,
};

describe('ScheduleController', () => {
  describe('PUT /notification/schedules/:notificationId', () => {
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

    it('不正な通知IDでは400を返す', async () => {
      const { app, service, bindings } = setup();

      const response = await app.request(
        '/notification/schedules/abc',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validBody),
        },
        bindings
      );

      expect(response.status).toBe(400);
      expect(service.updateSchedule).not.toHaveBeenCalled();
    });

    it('不正なスケジュールデータでは400を返す', async () => {
      const { app, service, bindings } = setup();

      const response = await app.request(
        '/notification/schedules/4',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ create_user_id: 1 }),
        },
        bindings
      );

      expect(response.status).toBe(400);
      expect(service.updateSchedule).not.toHaveBeenCalled();
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

    it('draft以外のステータスでは409を返す', async () => {
      const { app, service, bindings } = setup();
      (service.updateSchedule as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Only schedules with "draft" status can be updated.')
      );

      const response = await app.request(
        '/notification/schedules/4',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validBody),
        },
        bindings
      );

      expect(response.status).toBe(409);
    });

    it('サービスが失敗した場合は500を返す', async () => {
      const { app, service, bindings } = setup();
      (service.updateSchedule as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('failure')
      );

      const response = await app.request(
        '/notification/schedules/4',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validBody),
        },
        bindings
      );

      expect(response.status).toBe(500);
    });
  });
});
