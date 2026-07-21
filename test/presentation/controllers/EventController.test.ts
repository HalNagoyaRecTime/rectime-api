import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createEventController } from '../../../src/presentation/controllers/EventController';
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
  };
  const controller = createEventController(eventService);
  const app = new Hono();
  app.get('/events', c => controller.getAllEvents(c));
  app.get('/events/:eventId', c => controller.getEventById(c));
  return { app, eventService };
}

describe('EventController', () => {
  describe('getAllEvents', () => {
    it('クエリパラメータなしの場合、undefinedを渡しlimit=50/offset=0を既定値として返す', async () => {
      const { app, eventService } = setup();
      const events = [buildEvent()];
      (eventService.getAllEvents as ReturnType<typeof vi.fn>).mockResolvedValue(
        { events, total: 1 }
      );

      const response = await app.request('/events');

      expect(eventService.getAllEvents).toHaveBeenCalledWith({
        startTime: undefined,
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
        { events, total: 1 }
      );

      const response = await app.request(
        '/events?start_time=0930&limit=10&offset=5'
      );

      expect(eventService.getAllEvents).toHaveBeenCalledWith({
        startTime: '0930',
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
});
