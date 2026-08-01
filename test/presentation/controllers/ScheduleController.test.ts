import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IScheduleService } from '../../../src/application/services/IScheduleService';
import { createScheduleController } from '../../../src/presentation/controllers/ScheduleController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/sessionAuthentication';

function setup() {
  const service: IScheduleService = {
    // TODO: mainマージ時（GET /notification/schedules 削除時）に getAllSchedules を削除する
    getAllSchedules: vi.fn(),
    updateSchedule: vi.fn(),
  };
  const controller = createScheduleController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthenticationVariables;
  }>();
  // TODO: mainマージ時（PUTのみになる予定）にこのGETルートを削除する
  app.get('/notification/schedules', c => controller.getAllSchedules(c));
  app.put('/notification/schedules/:notificationId', c =>
    controller.updateSchedule(c)
  );
  const bindings = {} as Env;
  return { app, service, bindings };
}

const validBody = {
  CreateUserId: 1,
  NewEventId: 2,
  NewImportance: 2,
  NewSendAt: '2026-07-23T09:00:00.000Z',
  NewGatheringId: 3,
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
  // ------------------------------------------------------------------
  // GET /notification/schedules
  // TODO: mainブランチへのマージ時にこのdescribeブロックごと削除する
  // （最終的にはPUTエンドポイントのみが残る予定）
  // ------------------------------------------------------------------
  describe('GET /notification/schedules（廃止予定）', () => {
    it('スケジュール一覧を返す', async () => {
      const { app, service, bindings } = setup();
      (service.getAllSchedules as ReturnType<typeof vi.fn>).mockResolvedValue(
        scheduleEntity
      );

      const response = await app.request(
        '/notification/schedules',
        {},
        bindings
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(scheduleEntity);
    });

    it('サービスが失敗した場合は500を返す', async () => {
      const { app, service, bindings } = setup();
      (service.getAllSchedules as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('failure')
      );

      const response = await app.request(
        '/notification/schedules',
        {},
        bindings
      );

      expect(response.status).toBe(500);
    });
  });

  // ------------------------------------------------------------------
  // PUT /notification/schedules/:notificationId
  // mainマージ後もこのブロックは残す
  // ------------------------------------------------------------------
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
          body: JSON.stringify({ CreateUserId: 1 }),
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
