import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const EVENT_NAMES = [
  '走れ！○人○脚！',
  'サバイバルドッジボール',
  '紙飛行機飛ばし',
  '学科別対抗リレー',
];

// migrations/0035_seed_2026_events.sql と同じ内容。再実行しても重複登録されない
// (WHERE NOT EXISTS による冪等性)ことを検証するために使う。
const SEED_STATEMENTS = [
  `INSERT INTO events (event_name, rule_text, start_time, end_time)
   SELECT '走れ！○人○脚！', 'ルール概要', '1030', '1130'
   WHERE NOT EXISTS (SELECT 1 FROM events WHERE event_name = '走れ！○人○脚！')`,
  `INSERT INTO events (event_name, rule_text, start_time, end_time)
   SELECT 'サバイバルドッジボール', 'ルール概要', '1350', '1420'
   WHERE NOT EXISTS (SELECT 1 FROM events WHERE event_name = 'サバイバルドッジボール')`,
  `INSERT INTO events (event_name, rule_text, start_time, end_time)
   SELECT '紙飛行機飛ばし', 'ルール概要', '1350', '1420'
   WHERE NOT EXISTS (SELECT 1 FROM events WHERE event_name = '紙飛行機飛ばし')`,
  `INSERT INTO events (event_name, rule_text, start_time, end_time)
   SELECT '学科別対抗リレー', 'ルール概要', '1420', '1450'
   WHERE NOT EXISTS (SELECT 1 FROM events WHERE event_name = '学科別対抗リレー')`,
  `INSERT INTO event_venues (event_id, venue_id)
   SELECT events.event_id, venues.venue_id
   FROM events, venues
   WHERE events.event_name IN ('サバイバルドッジボール', '紙飛行機飛ばし')
     AND venues.venue_name = '体育館'
     AND NOT EXISTS (
       SELECT 1 FROM event_venues
       WHERE event_venues.event_id = events.event_id
         AND event_venues.venue_id = venues.venue_id
     )`,
];

async function eventVenueNames(eventName: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT venues.venue_name as venue_name
     FROM event_venues
     INNER JOIN events ON events.event_id = event_venues.event_id
     INNER JOIN venues ON venues.venue_id = event_venues.venue_id
     WHERE events.event_name = ?`
  )
    .bind(eventName)
    .all<{ venue_name: string }>();
  return rows.results.map(row => row.venue_name);
}

describe('0035_seed_2026_events.sql', () => {
  it('2026年度の4競技が登録されている', async () => {
    const events = await env.DB.prepare(
      `SELECT event_name, rule_text, start_time, end_time FROM events
       WHERE event_name IN (?, ?, ?, ?)
       ORDER BY event_name`
    )
      .bind(...EVENT_NAMES)
      .all();

    expect(events.results).toEqual([
      expect.objectContaining({
        event_name: 'サバイバルドッジボール',
        start_time: '1350',
        end_time: '1420',
      }),
      expect.objectContaining({
        event_name: '学科別対抗リレー',
        start_time: '1420',
        end_time: '1450',
      }),
      expect.objectContaining({
        event_name: '紙飛行機飛ばし',
        start_time: '1350',
        end_time: '1420',
      }),
      expect.objectContaining({
        event_name: '走れ！○人○脚！',
        start_time: '1030',
        end_time: '1130',
      }),
    ]);
  });

  it('会場が判明している競技だけ体育館と紐付けられている', async () => {
    expect(await eventVenueNames('サバイバルドッジボール')).toEqual(['体育館']);
    expect(await eventVenueNames('紙飛行機飛ばし')).toEqual(['体育館']);
    expect(await eventVenueNames('走れ！○人○脚！')).toEqual([]);
    expect(await eventVenueNames('学科別対抗リレー')).toEqual([]);
  });

  it('同じ内容を再登録しようとしても競技・会場紐付けのどちらも重複しない', async () => {
    await env.DB.batch(SEED_STATEMENTS.map(sql => env.DB.prepare(sql)));

    const eventCounts = await env.DB.prepare(
      `SELECT event_name, COUNT(*) as count FROM events
       WHERE event_name IN (?, ?, ?, ?)
       GROUP BY event_name`
    )
      .bind(...EVENT_NAMES)
      .all<{ event_name: string; count: number }>();
    expect(eventCounts.results).toHaveLength(4);
    for (const row of eventCounts.results) {
      expect(row.count).toBe(1);
    }

    expect(await eventVenueNames('サバイバルドッジボール')).toEqual(['体育館']);
    expect(await eventVenueNames('紙飛行機飛ばし')).toEqual(['体育館']);
  });
});
