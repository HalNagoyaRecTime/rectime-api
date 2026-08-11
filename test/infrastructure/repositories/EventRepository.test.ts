import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEventRepository } from '../../../src/infrastructure/repositories/EventRepository';
import { seedEvents, type SeededEventData } from '../../fixtures/events';

describe('EventRepository', () => {
  const repo = createEventRepository(env.DB);
  let seeded: SeededEventData;

  beforeAll(async () => {
    seeded = await seedEvents(env.DB);
  });

  describe('findAll', () => {
    it('全件をstart_time昇順で返し、totalも返す', async () => {
      const result = await repo.findAll({});

      expect(result.total).toBe(seeded.events.length);
      expect(result.events).toHaveLength(seeded.events.length);
      const times = result.events.map(event => event.start_time);
      expect(times).toEqual([...times].sort());
    });

    it('start_timeで絞り込める', async () => {
      const target = seeded.events[0];
      const expected = seeded.events.filter(
        event => event.startTime === target.startTime
      );
      const result = await repo.findAll({ startTime: target.startTime });

      expect(result.total).toBe(expected.length);
      expect(result.events).toHaveLength(expected.length);
      expect(
        result.events.every(event => event.start_time === target.startTime)
      ).toBe(true);
    });

    it('limitとoffsetでページネーションできる', async () => {
      const result = await repo.findAll({ limit: 2, offset: 1 });

      expect(result.total).toBe(seeded.events.length);
      expect(result.events).toHaveLength(2);
    });

    it('limit: 0のときは0件返す（totalは全件数のまま）', async () => {
      const result = await repo.findAll({ limit: 0 });

      expect(result.events).toHaveLength(0);
      expect(result.total).toBe(seeded.events.length);
    });
  });

  describe('findById', () => {
    it('idでイベントを取得できる', async () => {
      const target = seeded.events[0];
      const event = await repo.findById(target.eventId);

      expect(event).toMatchObject({
        event_id: target.eventId,
        event_name: target.name,
        start_time: target.startTime,
        end_time: target.endTime,
        venue: target.venue,
      });
    });

    it('存在しないidの場合はnullを返す', async () => {
      await expect(repo.findById(999999)).resolves.toBeNull();
    });
  });

  describe('exists', () => {
    it('存在するidはtrue、存在しないidはfalseを返す', async () => {
      const target = seeded.events[0];

      await expect(repo.exists(target.eventId)).resolves.toBe(true);
      await expect(repo.exists(999999)).resolves.toBe(false);
    });
  });
});
