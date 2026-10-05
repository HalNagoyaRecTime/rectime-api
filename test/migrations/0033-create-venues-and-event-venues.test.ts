import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0033_create_venues_and_event_venues.sql'
  );
  if (!migration) {
    throw new Error(
      '0033_create_venues_and_event_venues.sql is not registered'
    );
  }
  return migration.queries;
})();

async function prepareBeforeMigration() {
  const { results: columns } = await env.DB.prepare(
    "SELECT name FROM pragma_table_info('events') WHERE name = 'venue'"
  ).all();
  if (columns.length === 0) {
    await env.DB.prepare(
      "ALTER TABLE events ADD COLUMN venue TEXT NOT NULL DEFAULT ''"
    ).run();
  }
  await env.DB.batch([
    env.DB.prepare('DROP TABLE IF EXISTS event_venues'),
    env.DB.prepare('DROP TABLE IF EXISTS venues'),
    env.DB.prepare("DELETE FROM events WHERE event_name LIKE '0033移行確認%'"),
  ]);
}

async function runMigration() {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

async function insertEvent(name: string, venue: string): Promise<number> {
  const event = await env.DB.prepare(
    'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
  )
    .bind(name, venue, '09:00', '10:00')
    .first<{ event_id: number }>();
  return event!.event_id;
}

async function venueNamesOf(eventId: number): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT venues.venue_name AS venue_name
     FROM event_venues
     INNER JOIN venues ON venues.venue_id = event_venues.venue_id
     WHERE event_venues.event_id = ?
     ORDER BY venues.venue_name`
  )
    .bind(eventId)
    .all<{ venue_name: string }>();
  return results.map(row => row.venue_name);
}

describe('0033_create_venues_and_event_venues.sql のデータ移行', () => {
  beforeEach(prepareBeforeMigration);

  it('重複する実施場所名は1件のマスタへまとまる', async () => {
    const firstEventId = await insertEvent('0033移行確認競技A', '0033移行確認体育館');
    const secondEventId = await insertEvent('0033移行確認競技B', '0033移行確認体育館');
    const thirdEventId = await insertEvent('0033移行確認競技C', '0033移行確認グラウンド');

    await runMigration();

    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM venues WHERE venue_name = ?'
    )
      .bind('0033移行確認体育館')
      .first<{ count: number }>();
    expect(row?.count).toBe(1);

    expect(await venueNamesOf(firstEventId)).toEqual(['0033移行確認体育館']);
    expect(await venueNamesOf(secondEventId)).toEqual(['0033移行確認体育館']);
    expect(await venueNamesOf(thirdEventId)).toEqual(['0033移行確認グラウンド']);
  });

  it('実施場所を持つ既存の競技すべてに紐づけが作られる', async () => {
    await insertEvent('0033移行確認競技D', '0033移行確認体育館');
    await insertEvent('0033移行確認競技E', '0033移行確認プール');

    await runMigration();

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM events
       WHERE TRIM(venue) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM event_venues WHERE event_venues.event_id = events.event_id
         )`
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });

  it('前後に半角・全角の空白を含む実施場所名も同じマスタへまとまる', async () => {
    const eventId = await insertEvent('0033移行確認競技F', '  0033移行確認武道場  ');
    await insertEvent('0033移行確認競技G', '0033移行確認武道場');
    const fullWidthEventId = await insertEvent(
      '0033移行確認競技I',
      '\u30000033移行確認武道場\u3000'
    );

    await runMigration();

    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM venues WHERE venue_name = ?'
    )
      .bind('0033移行確認武道場')
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
    expect(await venueNamesOf(eventId)).toEqual(['0033移行確認武道場']);
    expect(await venueNamesOf(fullWidthEventId)).toEqual([
      '0033移行確認武道場',
    ]);
  });

  it('実施場所名の途中にある全角空白は残す', async () => {
    const eventId = await insertEvent(
      '0033移行確認競技J',
      '0033移行確認第1\u3000体育館'
    );

    await runMigration();

    expect(await venueNamesOf(eventId)).toEqual([
      '0033移行確認第1\u3000体育館',
    ]);
  });

  it('実施場所が空文字の競技はマスタを作らない', async () => {
    const eventId = await insertEvent('0033移行確認競技H', '');

    await runMigration();

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM venues WHERE venue_name = ''"
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
    expect(await venueNamesOf(eventId)).toEqual([]);
  });
});
