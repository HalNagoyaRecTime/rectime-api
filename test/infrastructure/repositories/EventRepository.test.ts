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

  async function linkVenues(
    eventId: number,
    names: string[]
  ): Promise<{ venueIds: number[]; cleanup: () => Promise<void> }> {
    const venueIds: number[] = [];
    for (const name of names) {
      const venue = await env.DB.prepare(
        'INSERT INTO venues (venue_name) VALUES (?) RETURNING venue_id'
      )
        .bind(name)
        .first<{ venue_id: number }>();
      venueIds.push(venue!.venue_id);
    }
    // venue_idの昇順で返ることを確かめるため、紐づけは昇順と逆に行う。
    for (const venueId of [...venueIds].reverse()) {
      await env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      )
        .bind(eventId, venueId)
        .run();
    }
    return {
      venueIds,
      cleanup: async () => {
        for (const venueId of venueIds) {
          await env.DB.prepare('DELETE FROM event_venues WHERE venue_id = ?')
            .bind(venueId)
            .run();
          await env.DB.prepare('DELETE FROM venues WHERE venue_id = ?')
            .bind(venueId)
            .run();
        }
      },
    };
  }

  async function createVenues(
    names: string[]
  ): Promise<{ venueIds: number[]; cleanup: () => Promise<void> }> {
    const venueIds: number[] = [];
    for (const name of names) {
      const venue = await env.DB.prepare(
        'INSERT INTO venues (venue_name) VALUES (?) RETURNING venue_id'
      )
        .bind(name)
        .first<{ venue_id: number }>();
      venueIds.push(venue!.venue_id);
    }
    return {
      venueIds,
      cleanup: async () => {
        for (const venueId of venueIds) {
          await env.DB.prepare('DELETE FROM venues WHERE venue_id = ?')
            .bind(venueId)
            .run();
        }
      },
    };
  }

  async function deleteEvent(eventId: number | undefined) {
    if (eventId === undefined) return;
    await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
      .bind(eventId)
      .run();
  }

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

    it('各イベントの実施場所をvenue_id昇順で含める', async () => {
      const target = seeded.events[0];
      const { venueIds, cleanup } = await linkVenues(target.eventId, [
        'findAll用第1体育館',
        'findAll用グラウンド',
      ]);

      try {
        const result = await repo.findAll({});
        const event = result.events.find(e => e.event_id === target.eventId);
        const others = result.events.filter(e => e.event_id !== target.eventId);

        expect(event?.venues).toEqual([
          { venue_id: venueIds[0], venue_name: 'findAll用第1体育館' },
          { venue_id: venueIds[1], venue_name: 'findAll用グラウンド' },
        ]);
        expect(others.every(e => e.venues.length === 0)).toBe(true);
      } finally {
        await cleanup();
      }
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

    it('gatheringが無いイベントは0件のgathering_summaryを返す', async () => {
      const target = seeded.events[0];
      const result = await repo.findAll({ startTime: target.startTime });
      const event = result.events.find(e => e.event_id === target.eventId);

      expect(event?.gathering_summary).toEqual({
        gathering_count: 0,
        configured_gathering_count: 0,
        first_gathering_time: null,
      });
    });

    it('gatheringのgathering_summaryをN+1なしで集計する', async () => {
      const target = seeded.events[0];
      const spot = await env.DB.prepare(
        "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('findAll用集合場所') RETURNING gathering_spot_id"
      ).first<{ gathering_spot_id: number }>();

      const insertGathering = async (gatheringTime?: string) => {
        const stmt = gatheringTime
          ? env.DB.prepare(
              'INSERT INTO gatherings (event_id, gathering_spot_id, gathering_time) VALUES (?, ?, ?) RETURNING gathering_id'
            ).bind(target.eventId, spot!.gathering_spot_id, gatheringTime)
          : env.DB.prepare(
              'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
            ).bind(target.eventId, spot!.gathering_spot_id);
        return stmt.first<{ gathering_id: number }>();
      };

      const g1 = await insertGathering('10:45');
      const g2 = await insertGathering('11:00');
      const g3 = await insertGathering();

      try {
        const result = await repo.findAll({ startTime: target.startTime });
        const event = result.events.find(e => e.event_id === target.eventId);

        expect(event?.gathering_summary).toEqual({
          gathering_count: 3,
          configured_gathering_count: 2,
          first_gathering_time: '10:45',
        });
      } finally {
        for (const g of [g1, g2, g3]) {
          await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
            .bind(g!.gathering_id)
            .run();
        }
        await env.DB.prepare(
          'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
        )
          .bind(spot!.gathering_spot_id)
          .run();
      }
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
      });
    });

    it('存在しないidの場合はnullを返す', async () => {
      await expect(repo.findById(999999)).resolves.toBeNull();
    });
  });

  describe('findWithVenuesById', () => {
    it('実施場所をvenue_id昇順で含める', async () => {
      const target = seeded.events[1];
      const { venueIds, cleanup } = await linkVenues(target.eventId, [
        'findWithVenuesById用第1体育館',
        'findWithVenuesById用グラウンド',
      ]);

      try {
        const event = await repo.findWithVenuesById(target.eventId);

        expect(event?.venues).toEqual([
          {
            venue_id: venueIds[0],
            venue_name: 'findWithVenuesById用第1体育館',
          },
          {
            venue_id: venueIds[1],
            venue_name: 'findWithVenuesById用グラウンド',
          },
        ]);
      } finally {
        await cleanup();
      }
    });

    it('実施場所が無いイベントは空配列を返す', async () => {
      const event = await repo.findWithVenuesById(seeded.events[0].eventId);

      expect(event?.venues).toEqual([]);
    });

    it('存在しないidの場合はnullを返す', async () => {
      await expect(repo.findWithVenuesById(999999)).resolves.toBeNull();
    });
  });

  describe('exists', () => {
    it('存在するidはtrue、存在しないidはfalseを返す', async () => {
      const target = seeded.events[0];

      await expect(repo.exists(target.eventId)).resolves.toBe(true);
      await expect(repo.exists(999999)).resolves.toBe(false);
    });
  });

  describe('create', () => {
    it('実施場所を紐づけて作成し、venue_id昇順のvenuesを含めて返す', async () => {
      const { venueIds, cleanup } = await createVenues([
        'create用第1体育館',
        'create用グラウンド',
      ]);
      let createdId: number | undefined;

      try {
        const created = await repo.create({
          name: 'create用イベント',
          ruleText: null,
          venueIds: [...venueIds].reverse(),
          startTime: '0900',
          endTime: '0930',
        });
        createdId = created.event_id;

        expect(created).toMatchObject({
          event_name: 'create用イベント',
          venues: [
            { venue_id: venueIds[0], venue_name: 'create用第1体育館' },
            { venue_id: venueIds[1], venue_name: 'create用グラウンド' },
          ],
        });
      } finally {
        await deleteEvent(createdId);
        await cleanup();
      }
    });

    it('存在しない実施場所を含む場合は競技も作成しない', async () => {
      await expect(
        repo.create({
          name: 'create失敗用イベント',
          ruleText: null,
          venueIds: [999999],
          startTime: '0900',
          endTime: '0930',
        })
      ).rejects.toThrow();

      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM events WHERE event_name = 'create失敗用イベント'"
      ).first<{ count: number }>();
      expect(row?.count).toBe(0);
    });
  });

  describe('update', () => {
    it('Event本体を更新し、実施場所を全置換する', async () => {
      const { venueIds, cleanup } = await createVenues([
        'update用第1体育館',
        'update用グラウンド',
        'update用トラック',
      ]);
      const created = await repo.create({
        name: 'update用イベント',
        ruleText: null,
        venueIds: [venueIds[0], venueIds[1]],
        startTime: '0900',
        endTime: '0930',
      });

      try {
        const updated = await repo.update(created.event_id, {
          name: '更新後のイベント',
          ruleText: '規則',
          venueIds: [venueIds[1], venueIds[2]],
          startTime: '1000',
          endTime: '1030',
        });

        expect(updated).toMatchObject({
          event_id: created.event_id,
          event_name: '更新後のイベント',
          rule_text: '規則',
          venues: [
            { venue_id: venueIds[1], venue_name: 'update用グラウンド' },
            { venue_id: venueIds[2], venue_name: 'update用トラック' },
          ],
          start_time: '1000',
          end_time: '1030',
        });
      } finally {
        await deleteEvent(created.event_id);
        await cleanup();
      }
    });

    it('存在しないidの場合はnullを返し、紐づけも作らない', async () => {
      const { venueIds, cleanup } = await createVenues(['update不在用体育館']);

      try {
        const updated = await repo.update(999999, {
          name: '更新後のイベント',
          ruleText: null,
          venueIds,
          startTime: '1000',
          endTime: '1030',
        });

        expect(updated).toBeNull();
        const row = await env.DB.prepare(
          'SELECT COUNT(*) AS count FROM event_venues WHERE venue_id = ?'
        )
          .bind(venueIds[0])
          .first<{ count: number }>();
        expect(row?.count).toBe(0);
      } finally {
        await cleanup();
      }
    });
  });

  describe('findByParticipantUserId', () => {
    it('ユーザーが集合に参加しているイベントだけを返す', async () => {
      const target = seeded.events[0];
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('findByParticipantUserId用ユーザー') RETURNING user_id"
      ).first<{ user_id: number }>();
      const spot = await env.DB.prepare(
        "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('findByParticipantUserId用集合場所') RETURNING gathering_spot_id"
      ).first<{ gathering_spot_id: number }>();
      const gathering = await env.DB.prepare(
        'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
      )
        .bind(target.eventId, spot!.gathering_spot_id)
        .first<{ gathering_id: number }>();
      await env.DB.prepare(
        'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
      )
        .bind(gathering!.gathering_id, user!.user_id)
        .run();

      try {
        const result = await repo.findByParticipantUserId(user!.user_id);

        expect(result).toHaveLength(1);
        expect(result[0].event_id).toBe(target.eventId);
        expect(result[0].venues).toEqual([]);
      } finally {
        await env.DB.prepare(
          'DELETE FROM gathering_group_members WHERE gathering_id = ?'
        )
          .bind(gathering!.gathering_id)
          .run();
        await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
          .bind(gathering!.gathering_id)
          .run();
        await env.DB.prepare(
          'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
        )
          .bind(spot!.gathering_spot_id)
          .run();
        await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
          .bind(user!.user_id)
          .run();
      }
    });

    it('参加している集合が無いユーザーは空配列を返す', async () => {
      await expect(repo.findByParticipantUserId(999999)).resolves.toEqual([]);
    });
  });
});
