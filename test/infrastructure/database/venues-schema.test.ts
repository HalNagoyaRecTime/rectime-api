import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// venues / event_venues は migrations/0033 で追加した実施場所のマスタと
// 競技との中間テーブルで、まだ専用のリポジトリ層を持たない。
// ここでは「同じ競技に同じ実施場所を二重登録できない」ことを含む制約が
// スキーマレベルで機能しているかを直接SQLで検証する。
describe('venues/event_venues テーブルの制約', () => {
  afterEach(async () => {
    await env.DB.prepare(
      "DELETE FROM event_venues WHERE venue_id IN (SELECT venue_id FROM venues WHERE venue_name LIKE 'スキーマテスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM event_venues WHERE event_id IN (SELECT event_id FROM events WHERE event_name LIKE 'スキーマテスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM venues WHERE venue_name LIKE 'スキーマテスト%'"
    ).run();
    await env.DB.prepare(
      "DELETE FROM events WHERE event_name LIKE 'スキーマテスト%'"
    ).run();
  });

  async function createTestEvent(name: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO events (event_name, start_time, end_time) VALUES (?, ?, ?) RETURNING event_id'
    )
      .bind(name, '10:00', '11:00')
      .first<{ event_id: number }>();
    if (!row) throw new Error('failed to create test event');
    return row.event_id;
  }

  async function createTestVenue(name: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO venues (venue_name) VALUES (?) RETURNING venue_id'
    )
      .bind(name)
      .first<{ venue_id: number }>();
    if (!row) throw new Error('failed to create test venue');
    return row.venue_id;
  }

  describe('venues', () => {
    it('実施場所を作成できる', async () => {
      const venue = await env.DB.prepare(
        'INSERT INTO venues (venue_name) VALUES (?) RETURNING venue_id, venue_name'
      )
        .bind('スキーマテスト第1体育館')
        .first<{ venue_id: number; venue_name: string }>();

      expect(venue).toMatchObject({ venue_name: 'スキーマテスト第1体育館' });
    });

    it('同じ名前の実施場所は UNIQUE 制約で登録できない', async () => {
      await createTestVenue('スキーマテスト第2体育館');

      await expect(
        env.DB.prepare('INSERT INTO venues (venue_name) VALUES (?)')
          .bind('スキーマテスト第2体育館')
          .run()
      ).rejects.toThrow('UNIQUE constraint failed');
    });
  });

  describe('event_venues', () => {
    it('1つの競技に複数の実施場所を紐づけられる', async () => {
      const eventId = await createTestEvent('スキーマテスト競技');
      const firstVenueId = await createTestVenue('スキーマテストグラウンド');
      const secondVenueId = await createTestVenue('スキーマテストプール');

      await env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      )
        .bind(eventId, firstVenueId)
        .run();
      await env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      )
        .bind(eventId, secondVenueId)
        .run();

      const { results } = await env.DB.prepare(
        'SELECT venue_id FROM event_venues WHERE event_id = ? ORDER BY venue_id'
      )
        .bind(eventId)
        .all<{ venue_id: number }>();

      expect(results.map(row => row.venue_id)).toEqual(
        [firstVenueId, secondVenueId].sort((a, b) => a - b)
      );
    });

    it('1つの実施場所を複数の競技に紐づけられる', async () => {
      const firstEventId = await createTestEvent('スキーマテスト競技A');
      const secondEventId = await createTestEvent('スキーマテスト競技B');
      const venueId = await createTestVenue('スキーマテスト共用コート');

      await env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      )
        .bind(firstEventId, venueId)
        .run();
      await env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      )
        .bind(secondEventId, venueId)
        .run();

      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM event_venues WHERE venue_id = ?'
      )
        .bind(venueId)
        .first<{ count: number }>();

      expect(row?.count).toBe(2);
    });

    it('同じ競技に同じ実施場所を二重登録すると UNIQUE 制約で失敗する', async () => {
      const eventId = await createTestEvent('スキーマテスト競技C');
      const venueId = await createTestVenue('スキーマテスト武道場');
      await env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      )
        .bind(eventId, venueId)
        .run();

      await expect(
        env.DB.prepare(
          'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
        )
          .bind(eventId, venueId)
          .run()
      ).rejects.toThrow('UNIQUE constraint failed');
    });

    it('存在しない event_id では FOREIGN KEY 制約で失敗する', async () => {
      const venueId = await createTestVenue('スキーマテスト体育室');

      await expect(
        env.DB.prepare(
          'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
        )
          .bind(999999, venueId)
          .run()
      ).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('存在しない venue_id では FOREIGN KEY 制約で失敗する', async () => {
      const eventId = await createTestEvent('スキーマテスト競技D');

      await expect(
        env.DB.prepare(
          'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
        )
          .bind(eventId, 999999)
          .run()
      ).rejects.toThrow('FOREIGN KEY constraint failed');
    });

    it('競技を削除すると紐づけも削除される', async () => {
      const eventId = await createTestEvent('スキーマテスト競技E');
      const venueId = await createTestVenue('スキーマテスト第3体育館');
      await env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      )
        .bind(eventId, venueId)
        .run();

      await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
        .bind(eventId)
        .run();

      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM event_venues WHERE event_id = ?'
      )
        .bind(eventId)
        .first<{ count: number }>();

      expect(row?.count).toBe(0);
    });

    it('競技から紐づけられている実施場所は削除できない', async () => {
      const eventId = await createTestEvent('スキーマテスト競技F');
      const venueId = await createTestVenue('スキーマテスト柔道場');
      await env.DB.prepare(
        'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
      )
        .bind(eventId, venueId)
        .run();

      await expect(
        env.DB.prepare('DELETE FROM venues WHERE venue_id = ?')
          .bind(venueId)
          .run()
      ).rejects.toThrow('FOREIGN KEY constraint failed');
    });
  });
});
