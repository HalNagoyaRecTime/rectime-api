import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEventRepository } from '../../../src/infrastructure/repositories/EventRepository';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import { seedEvents, type SeededEventData } from '../../fixtures/events';

describe('EventRepository', () => {
  let repo: IEventRepository;
  let seeded: SeededEventData;

  beforeAll(async () => {
    seeded = await seedEvents(env.DB);
    repo = createEventRepository(env.DB);
  });

  describe('findAll', () => {
    it('全件を time 昇順で返し、total も返す', async () => {
      const result = await repo.findAll({});

      expect(result.total).toBe(seeded.events.length);
      expect(result.events).toHaveLength(seeded.events.length);
      const times = result.events.map(e => e.f_time);
      expect(times).toEqual([...times].sort());
    });

    it('eventCode で絞り込める', async () => {
      const target = seeded.events[0];
      const result = await repo.findAll({ eventCode: target.eventCode });

      expect(result.total).toBe(1);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].f_event_code).toBe(target.eventCode);
    });

    it('time で絞り込める', async () => {
      const target = seeded.events[0];
      const expected = seeded.events.filter(e => e.time === target.time);
      const result = await repo.findAll({ time: target.time });

      expect(result.total).toBe(expected.length);
      expect(result.events).toHaveLength(expected.length);
      expect(result.events.every(e => e.f_time === target.time)).toBe(true);
    });

    it('limit と offset でページネーションできる', async () => {
      const result = await repo.findAll({ limit: 2, offset: 1 });

      expect(result.total).toBe(seeded.events.length);
      expect(result.events).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('id でイベントを取得できる', async () => {
      const target = seeded.events[0];
      const event = await repo.findById(target.eventId);

      expect(event).toMatchObject({
        f_event_id: target.eventId,
        f_event_code: target.eventCode,
        f_event_name: target.name,
        f_time: target.time,
        f_duration: target.duration,
        f_place: target.place,
        f_gather_time: target.gatherTime,
        f_summary: target.summary,
      });
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });

  describe('findByEventCode', () => {
    it('eventCode でイベントを取得できる', async () => {
      const target = seeded.events[2];
      const event = await repo.findByEventCode(target.eventCode);

      expect(event?.f_event_id).toBe(target.eventId);
      expect(event?.f_event_name).toBe(target.name);
      expect(event?.f_event_code).toBe(target.eventCode);
    });

    it('存在しない eventCode の場合は null を返す', async () => {
      expect(await repo.findByEventCode('EV-9999')).toBeNull();
    });
  });
});
