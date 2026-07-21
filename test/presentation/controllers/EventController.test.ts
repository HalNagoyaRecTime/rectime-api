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
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
  };
  const controller = createEventController(eventService);
  const app = new Hono();
  app.get('/events', c => controller.getAllEvents(c));
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
  });

  describe('updateEvent', () => {
    it('IDと有効な本文をServiceへ渡して更新する', async () => {
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
          venue: 'トラック',
          start_time: '1000',
          end_time: '1030',
        }),
      });

      expect(eventService.updateEvent).toHaveBeenCalledWith(1, {
        event_name: '更新後の徒競走',
        rule_text: '規則',
        venue: 'トラック',
        start_time: '1000',
        end_time: '1030',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(event);
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
