import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createEventController } from '../../../src/presentation/controllers/EventController';
import type { IEventService } from '../../../src/application/services/IEventService';
import type { EventWithVenuesEntity } from '../../../src/domain/entities/Event';

function buildEvent(
  overrides: Partial<EventWithVenuesEntity> = {}
): EventWithVenuesEntity {
  return {
    event_id: 1,
    event_name: '徒競走',
    rule_text: null,
    venues: [{ venue_id: 2, venue_name: 'トラック' }],
    start_time: '0930',
    end_time: '0950',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function setup(authenticatedUserId: number | null = 7) {
  const eventService: IEventService = {
    getAllEvents: vi.fn(),
    getEventById: vi.fn(),
    getMyEvents: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  };
  const controller = createEventController(eventService);
  const app = new Hono<{
    Bindings: { EVENT_DATE?: string };
    Variables: { authenticatedUserId: number | null };
  }>();
  app.use('*', async (c, next) => {
    c.set('authenticatedUserId', authenticatedUserId);
    await next();
  });
  app.get('/events', c => controller.getAllEvents(c));
  app.get('/me/events', c => controller.getMyEvents(c));
  app.get('/events/:eventId', c => controller.getEventById(c));
  app.post('/events', c => controller.createEvent(c));
  app.put('/events/:eventId', c => controller.updateEvent(c));
  app.delete('/events/:eventId', c => controller.deleteEvent(c));
  return { app, eventService };
}

describe('EventController', () => {
  describe('getAllEvents', () => {
    it('クエリパラメータなしの場合、undefinedを渡しlimit=50/offset=0を既定値として返す', async () => {
      const { app, eventService } = setup();
      const events = [buildEvent()];
      (eventService.getAllEvents as ReturnType<typeof vi.fn>).mockResolvedValue(
        { events, total: 1, limit: 50, offset: 0 }
      );

      const response = await app.request('/events');

      expect(eventService.getAllEvents).toHaveBeenCalledWith({
        start_time: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        events,
        total: 1,
        limit: 50,
        offset: 0,
      });
    });

    it('start_time、limit、offsetクエリを解析してサービスに渡す', async () => {
      const { app, eventService } = setup();
      const events = [buildEvent()];
      (eventService.getAllEvents as ReturnType<typeof vi.fn>).mockResolvedValue(
        { events, total: 1, limit: 10, offset: 5 }
      );

      const response = await app.request(
        '/events?start_time=0930&limit=10&offset=5'
      );

      expect(eventService.getAllEvents).toHaveBeenCalledWith({
        start_time: '0930',
        limit: 10,
        offset: 5,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        events,
        total: 1,
        limit: 10,
        offset: 5,
      });
    });

    it.each(['2460', '2360', '9999'])(
      'HHMMとして不正なstart_timeクエリ %s は400を返す',
      async invalid => {
        const { app, eventService } = setup();

        const response = await app.request(`/events?start_time=${invalid}`);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: {
            code: 'INVALID_START_TIME',
            message: '開始時刻の指定が正しくありません',
          },
        });
        expect(eventService.getAllEvents).not.toHaveBeenCalled();
      }
    );

    it('サービスが例外を投げた場合は内部詳細を含めず500を返す', async () => {
      const { app, eventService } = setup();
      (eventService.getAllEvents as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const response = await app.request('/events');

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: 'EVENT_LIST_FAILED',
          message: '競技一覧の取得に失敗しました',
        },
      });
    });
  });

  describe('getEventById', () => {
    it('存在するイベントを200で返す', async () => {
      const { app, eventService } = setup();
      const event = { ...buildEvent(), rounds: [] };
      (eventService.getEventById as ReturnType<typeof vi.fn>).mockResolvedValue(
        event
      );

      const response = await app.request('/events/1');

      expect(eventService.getEventById).toHaveBeenCalledWith(1);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(event);
    });

    it('数値でないIDの場合は400 INVALID_EVENT_IDを返す', async () => {
      const { app } = setup();

      const response = await app.request('/events/abc');

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: 'INVALID_EVENT_ID',
          message: '競技IDが正しくありません',
        },
      });
    });

    it('サービスがEvent not foundを投げた場合は404を返す', async () => {
      const { app, eventService } = setup();
      (eventService.getEventById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Event not found')
      );

      const response = await app.request('/events/999');

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: 'EVENT_NOT_FOUND', message: '競技が見つかりません' },
      });
    });

    it('その他の例外の場合は500とdetailsを返す', async () => {
      const { app, eventService } = setup();
      (eventService.getEventById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const response = await app.request('/events/1');

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: 'EVENT_FETCH_FAILED',
          message: '競技の取得に失敗しました',
        },
      });
    });
  });

  describe('getMyEvents', () => {
    it('未認証の場合は共通形式の401を返す', async () => {
      const { app } = setup(null);

      const response = await app.request('/me/events');

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      });
    });

    it('認証済みユーザーIDでServiceを呼び出し、参加イベント一覧を返す', async () => {
      const { app, eventService } = setup();
      const events = [buildEvent()];
      (eventService.getMyEvents as ReturnType<typeof vi.fn>).mockResolvedValue(
        events
      );

      const response = await app.request('/me/events');

      expect(eventService.getMyEvents).toHaveBeenCalledWith(7);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ events });
    });

    it('Serviceがエラーを投げた場合は500を返す', async () => {
      const { app, eventService } = setup();
      (eventService.getMyEvents as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const response = await app.request('/me/events');

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: 'MY_EVENT_LIST_FAILED',
          message: '参加競技一覧の取得に失敗しました',
        },
      });
    });
  });

  describe('createEvent', () => {
    it('有効な本文をServiceへ渡し、作成結果を201で返す', async () => {
      const { app, eventService } = setup();
      const event = buildEvent();
      (eventService.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
        event
      );

      const response = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '徒競走',
          rule_text: null,
          venue_ids: [2],
          start_time: '0930',
          end_time: '0950',
        }),
      });

      expect(eventService.createEvent).toHaveBeenCalledWith({
        event_name: '徒競走',
        rule_text: null,
        venue_ids: [2],
        start_time: '0930',
        end_time: '0950',
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual(event);
    });

    it.each(['2460', '2360', '9999'])(
      'HHMMとして不正な時刻 %s は400を返す',
      async invalid => {
        const { app, eventService } = setup();

        const response = await app.request('/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: '徒競走',
            rule_text: null,
            venue_ids: [2],
            start_time: invalid,
            end_time: '2359',
          }),
        });

        expect(response.status).toBe(400);
        expect(eventService.createEvent).not.toHaveBeenCalled();
      }
    );
  });

  describe('venue_ids', () => {
    it.each([
      ['空配列', []],
      ['重複', [2, 2]],
      ['0以下', [0]],
    ])('%sのvenue_idsは400を返す', async (_label, venueIds) => {
      const { app, eventService } = setup();

      const response = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '徒競走',
          rule_text: null,
          venue_ids: venueIds,
          start_time: '0930',
          end_time: '0950',
        }),
      });

      expect(response.status).toBe(400);
      expect(eventService.createEvent).not.toHaveBeenCalled();
    });

    it('venueを指定しvenue_idsが無い場合は400を返す', async () => {
      const { app, eventService } = setup();

      const response = await app.request('/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '徒競走',
          rule_text: null,
          venue: 'トラック',
          start_time: '0930',
          end_time: '0950',
        }),
      });

      expect(response.status).toBe(400);
      expect(eventService.createEvent).not.toHaveBeenCalled();
    });

    it.each([
      ['POST', '/events', 'createEvent'],
      ['PUT', '/events/1', 'updateEvent'],
    ] as const)(
      '%s で存在しない実施場所を指定した場合は404を返す',
      async (method, path, serviceMethod) => {
        const { app, eventService } = setup();
        (
          eventService[serviceMethod] as ReturnType<typeof vi.fn>
        ).mockRejectedValue(new Error('Venue not found'));

        const response = await app.request(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: '徒競走',
            rule_text: null,
            venue_ids: [99],
            start_time: '0930',
            end_time: '0950',
          }),
        });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          error: {
            code: 'VENUE_NOT_FOUND',
            message: expect.any(String),
          },
        });
      }
    );
  });

  describe('updateEvent', () => {
    it('IDと有効な本文をServiceへ渡して更新する(Notification固有fieldは扱わない)', async () => {
      const { app, eventService } = setup();
      const event = buildEvent({ event_name: '更新後の徒競走' });
      (eventService.updateEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
        event
      );

      const response = await app.request('/events/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '更新後の徒競走',
          rule_text: '規則',
          venue_ids: [2],
          start_time: '1000',
          end_time: '1030',
        }),
      });

      expect(eventService.updateEvent).toHaveBeenCalledWith(1, {
        event_name: '更新後の徒競走',
        rule_text: '規則',
        venue_ids: [2],
        start_time: '1000',
        end_time: '1030',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(event);
    });

    it('notification_enabledを含むRequestは400を返し、Serviceを呼ばない(#388)', async () => {
      const { app, eventService } = setup();

      const response = await app.request('/events/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '徒競走',
          rule_text: null,
          venue_ids: [2],
          start_time: '0930',
          end_time: '0950',
          notification_enabled: false,
        }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe('INVALID_EVENT_REQUEST');
      expect(body.error.message).toBe('競技情報の入力内容が正しくありません');
      expect(eventService.updateEvent).not.toHaveBeenCalled();
    });

    it('未定義のfieldを含むRequestは400を返し、Serviceを呼ばない', async () => {
      const { app, eventService } = setup();

      const response = await app.request('/events/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '徒競走',
          rule_text: null,
          venue_ids: [2],
          start_time: '0930',
          end_time: '0950',
          unknown_field: 'x',
        }),
      });

      expect(response.status).toBe(400);
      expect(eventService.updateEvent).not.toHaveBeenCalled();
    });

    it('想定外の例外は500とdetailsを返す', async () => {
      const { app, eventService } = setup();
      (eventService.updateEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const response = await app.request('/events/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '徒競走',
          rule_text: null,
          venue_ids: [2],
          start_time: '0930',
          end_time: '0950',
        }),
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: 'EVENT_UPDATE_FAILED',
          message: '競技の更新に失敗しました',
        },
      });
    });

    it('存在しないイベントの場合は404を返す', async () => {
      const { app, eventService } = setup();
      (eventService.updateEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Event not found')
      );

      const response = await app.request('/events/999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '徒競走',
          rule_text: null,
          venue_ids: [2],
          start_time: '0930',
          end_time: '0950',
        }),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: 'EVENT_NOT_FOUND', message: '競技が見つかりません' },
      });
    });

    it('開始・終了時刻が不正な場合は400を返す', async () => {
      const { app, eventService } = setup();

      const response = await app.request('/events/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: '徒競走',
          rule_text: null,
          venue_ids: [2],
          start_time: '0950',
          end_time: '0930',
        }),
      });

      expect(response.status).toBe(400);
      expect(eventService.updateEvent).not.toHaveBeenCalled();
    });
  });

  describe('deleteEvent', () => {
    it('参照中のイベントは409を返す', async () => {
      const { app, eventService } = setup();
      (eventService.deleteEvent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Event is in use')
      );

      const response = await app.request('/events/1', { method: 'DELETE' });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: {
          code: 'EVENT_IN_USE',
          message: '使用中の競技は削除できません',
        },
      });
    });
  });
});
