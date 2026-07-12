import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createEventController } from '../../../src/presentation/controllers/EventController';
import type { IEventService } from '../../../src/application/services/IEventService';
import type { EventEntity } from '../../../src/domain/entities/Event';

function buildEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    f_event_id: 1,
    f_event_code: 'E001',
    f_event_name: '徒競走',
    f_time: '0930',
    f_duration: '20',
    f_place: 'トラック',
    f_gather_time: '0920',
    f_summary: null,
    ...overrides,
  };
}

function setup() {
  const eventService: IEventService = {
    getAllEvents: vi.fn(),
    getEventById: vi.fn(),
  };
  const controller = createEventController(eventService);
  const app = new Hono();
  app.get('/events', c => controller.getAllEvents(c));
  app.get('/events/:eventId', c => controller.getEventById(c));
  return { app, eventService };
}

describe('EventController', () => {
  describe('getAllEvents', () => {
    it('クエリパラメータなしの場合、undefined を渡し limit=50/offset=0 を既定値として返す', async () => {
      const { app, eventService } = setup();
      const events = [buildEvent()];
      (eventService.getAllEvents as ReturnType<typeof vi.fn>).mockResolvedValue(
        { events, total: 1 }
      );

      const res = await app.request('/events');

      expect(eventService.getAllEvents).toHaveBeenCalledWith({
        eventCode: undefined,
        time: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        events,
        total: 1,
        limit: 50,
        offset: 0,
      });
    });

    it('f_event_code, f_time, limit, offset クエリを解析してサービスに渡す', async () => {
      const { app, eventService } = setup();
      const events = [buildEvent()];
      (eventService.getAllEvents as ReturnType<typeof vi.fn>).mockResolvedValue(
        { events, total: 1 }
      );

      const res = await app.request(
        '/events?f_event_code=E001&f_time=0930&limit=10&offset=5'
      );

      expect(eventService.getAllEvents).toHaveBeenCalledWith({
        eventCode: 'E001',
        time: '0930',
        limit: 10,
        offset: 5,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        events,
        total: 1,
        limit: 10,
        offset: 5,
      });
    });

    it('サービスが例外を投げた場合は 500 と details を返す', async () => {
      const { app, eventService } = setup();
      (eventService.getAllEvents as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const res = await app.request('/events');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to fetch events',
        details: 'db error',
      });
    });
  });

  describe('getEventById', () => {
    it('存在するイベントを 200 で返す', async () => {
      const { app, eventService } = setup();
      const event = buildEvent();
      (eventService.getEventById as ReturnType<typeof vi.fn>).mockResolvedValue(
        event
      );

      const res = await app.request('/events/1');

      expect(eventService.getEventById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(event);
    });

    it('数値でない ID の場合は 400 INVALID_EVENT_ID を返す', async () => {
      const { app } = setup();

      const res = await app.request('/events/abc');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'Invalid event ID',
        code: 'INVALID_EVENT_ID',
      });
    });

    it('サービスが Event not found を投げた場合は 404 を返す', async () => {
      const { app, eventService } = setup();
      (eventService.getEventById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Event not found')
      );

      const res = await app.request('/events/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: 'Event not found',
        code: 'EVENT_NOT_FOUND',
      });
    });

    it('その他の例外の場合は 500 と details を返す', async () => {
      const { app, eventService } = setup();
      (eventService.getEventById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const res = await app.request('/events/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to fetch event',
        details: 'db error',
      });
    });
  });
});
