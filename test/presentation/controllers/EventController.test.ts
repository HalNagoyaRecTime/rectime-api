import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createEventController } from '../../../src/presentation/controllers/EventController';
import type { IEventScheduleService } from '../../../src/application/services/IEventScheduleService';
import type { IEventService } from '../../../src/application/services/IEventService';
import type { EventEntity } from '../../../src/domain/entities/Event';

function buildEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    event_id: 1,
    event_name: '徒競走',
    rule_text: null,
    venue: 'トラック',
    start_time: '0930',
    end_time: '0950',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function setup() {
  const eventService: IEventService = {
    getAllEvents: vi.fn(),
    getEventById: vi.fn(),
    getMyEvents: vi.fn(),
    createEvent: vi.fn(),
    deleteEvent: vi.fn(),
  };
  const eventScheduleService: IEventScheduleService = {
    updateEventSchedule: vi.fn(),
    getEventNotificationSummary: vi.fn(),
  };
  const controller = createEventController(eventService, eventScheduleService);
  const app = new Hono<{
    Bindings: { EVENT_DATE?: string };
    Variables: { authenticatedUserId: number | null };
  }>();
  app.use('*', async (c, next) => {
    c.set('authenticatedUserId', 7);
    await next();
  });
  app.get('/events', c => controller.getAllEvents(c));
  app.get('/me/events', c => controller.getMyEvents(c));
  app.get('/events/:eventId', c => controller.getEventById(c));
  app.post('/events', c => controller.createEvent(c));
  app.put('/events/:eventId', c => controller.updateEvent(c));
  app.patch('/events/:eventId', c => controller.patchEvent(c));
  app.delete('/events/:eventId', c => controller.deleteEvent(c));
  return { app, eventService, eventScheduleService };
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
          error: 'Invalid start_time',
          code: 'INVALID_START_TIME',
        });
        expect(eventService.getAllEvents).not.toHaveBeenCalled();
      }
    );

    it('サービスが例外を投げた場合は500とdetailsを返す', async () => {
      const { app, eventService } = setup();
      (eventService.getAllEvents as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const response = await app.request('/events');

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to fetch events',
        details: 'db error',
      });
    });
  });

  describe('getEventById', () => {
    it('存在するイベントを200で返す', async () => {
      const { app, eventService } = setup();
      const event = buildEvent();
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
        error: 'Invalid event ID',
        code: 'INVALID_EVENT_ID',
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
        error: 'Event not found',
        code: 'EVENT_NOT_FOUND',
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
        error: 'Failed to fetch event',
        details: 'db error',
      });
    });
  });

  describe('getMyEvents', () => {
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
        error: 'Failed to fetch events',
        details: 'db error',
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
          venue: 'トラック',
          start_time: '0930',
          end_time: '0950',
        }),
      });

      expect(eventService.createEvent).toHaveBeenCalledWith({
        event_name: '徒競走',
        rule_text: null,
        venue: 'トラック',
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
            venue: 'トラック',
            start_time: invalid,
            end_time: '2359',
          }),
        });

        expect(response.status).toBe(400);
        expect(eventService.createEvent).not.toHaveBeenCalled();
      }
    );
  });

  describe('updateEvent', () => {
    it('IDと有効な本文をServiceへ渡して更新する', async () => {
      const { app, eventScheduleService } = setup();
      const event = buildEvent({ event_name: '更新後の徒競走' });
      (
        eventScheduleService.updateEventSchedule as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        event,
        notification_enabled: true,
        notification_schedules: [],
      });

      const response = await app.request(
        '/events/1',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: '更新後の徒競走',
            rule_text: '規則',
            venue: 'トラック',
            start_time: '1000',
            end_time: '1030',
            notification_enabled: true,
          }),
        },
        { EVENT_DATE: '2026-11-07' }
      );

      expect(eventScheduleService.updateEventSchedule).toHaveBeenCalledWith({
        event_id: 1,
        user_id: 7,
        event_name: '更新後の徒競走',
        rule_text: '規則',
        venue: 'トラック',
        start_time: '1000',
        end_time: '1030',
        notification_enabled: true,
        event_date: '2026-11-07',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        event,
        notification_enabled: true,
        notification_schedules: [],
      });
    });

    it('想定外の例外は500とdetailsを返す', async () => {
      const { app, eventScheduleService } = setup();
      (
        eventScheduleService.updateEventSchedule as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('db error'));

      const response = await app.request(
        '/events/1',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: '徒競走',
            rule_text: null,
            venue: 'トラック',
            start_time: '0930',
            end_time: '0950',
            notification_enabled: false,
          }),
        },
        { EVENT_DATE: '2026-11-07' }
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to update event',
        details: 'db error',
      });
    });

    it('notification_enabledがない既存Requestも受け付ける', async () => {
      const { app, eventScheduleService } = setup();
      (
        eventScheduleService.updateEventSchedule as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        event: buildEvent(),
        notification_enabled: false,
        notification_schedules: [],
      });
      const response = await app.request(
        '/events/1',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: '徒競走',
            rule_text: null,
            venue: 'トラック',
            start_time: '0930',
            end_time: '0950',
          }),
        },
        { EVENT_DATE: '2026-11-07' }
      );

      expect(response.status).toBe(200);
      expect(eventScheduleService.updateEventSchedule).toHaveBeenCalledWith({
        event_id: 1,
        user_id: 7,
        event_name: '徒競走',
        rule_text: null,
        venue: 'トラック',
        start_time: '0930',
        end_time: '0950',
        notification_enabled: undefined,
        event_date: '2026-11-07',
      });
    });

    it('既存時刻との組み合わせが不正な場合は400を返す', async () => {
      const { app, eventScheduleService } = setup();
      (
        eventScheduleService.updateEventSchedule as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('end_time must be after start_time'));

      const response = await app.request(
        '/events/1',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: '徒競走',
            rule_text: null,
            venue: 'トラック',
            start_time: '0930',
            end_time: '0950',
            notification_enabled: false,
          }),
        },
        { EVENT_DATE: '2026-11-07' }
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'end_time must be after start_time',
      });
    });
  });

  describe('patchEvent', () => {
    it('指定された項目だけをsnake_caseでServiceへ渡す', async () => {
      const { app, eventScheduleService } = setup();
      (
        eventScheduleService.updateEventSchedule as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        event: buildEvent({ venue: 'サブトラック' }),
        notification_enabled: false,
        notification_schedules: [],
      });

      const response = await app.request(
        '/events/1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venue: 'サブトラック',
            notification_enabled: false,
          }),
        },
        { EVENT_DATE: '2026-11-07' }
      );

      expect(response.status).toBe(200);
      expect(eventScheduleService.updateEventSchedule).toHaveBeenCalledWith({
        event_id: 1,
        user_id: 7,
        venue: 'サブトラック',
        notification_enabled: false,
        event_date: '2026-11-07',
      });
    });

    it('空のRequestは400を返す', async () => {
      const { app, eventScheduleService } = setup();

      const response = await app.request(
        '/events/1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        { EVENT_DATE: '2026-11-07' }
      );

      expect(response.status).toBe(400);
      expect(eventScheduleService.updateEventSchedule).not.toHaveBeenCalled();
    });

    it('既存の時刻と組み合わせて不正になる部分更新は400を返す', async () => {
      const { app, eventScheduleService } = setup();
      (
        eventScheduleService.updateEventSchedule as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('end_time must be after start_time'));

      const response = await app.request(
        '/events/1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start_time: '1000' }),
        },
        { EVENT_DATE: '2026-11-07' }
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'end_time must be after start_time',
      });
    });

    it('通知を生成しない会場更新はEVENT_DATEなしでもServiceへ渡す', async () => {
      const { app, eventScheduleService } = setup();
      (
        eventScheduleService.updateEventSchedule as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        event: buildEvent({ venue: 'サブトラック' }),
        notification_enabled: false,
        notification_schedules: [],
      });

      const response = await app.request('/events/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue: 'サブトラック' }),
      });

      expect(response.status).toBe(200);
      expect(eventScheduleService.updateEventSchedule).toHaveBeenCalledWith({
        event_id: 1,
        user_id: 7,
        venue: 'サブトラック',
        event_date: undefined,
      });
    });

    it('同時更新の競合は409を返す', async () => {
      const { app, eventScheduleService } = setup();
      (
        eventScheduleService.updateEventSchedule as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Event update conflict'));

      const response = await app.request(
        '/events/1',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ venue: 'サブトラック' }),
        },
        { EVENT_DATE: '2026-11-07' }
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: 'Event update conflict',
        code: 'EVENT_UPDATE_CONFLICT',
      });
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
      expect(await response.json()).toEqual({ error: 'Event is in use' });
    });
  });
});
