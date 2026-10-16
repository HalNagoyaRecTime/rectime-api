import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0035_create_venues_and_event_venues.sql'
  );
  if (!migration) {
    throw new Error(
      '0035_create_venues_and_event_venues.sql is not registered'
    );
  }
  return migration.queries;
})();

const testVenueName = '0035再実行確認体育館';

async function venueSchema() {
  const { results } = await env.DB.prepare(
    `SELECT type, name, sql FROM sqlite_master
     WHERE tbl_name IN ('venues', 'event_venues')
     ORDER BY type, name`
  ).all();
  return results;
}

describe('0035_create_venues_and_event_venues.sql', () => {
  afterEach(async () => {
    await env.DB.prepare('DELETE FROM venues WHERE venue_name = ?')
      .bind(testVenueName)
      .run();
  });

  it('マスタが既にある環境で実行しても、データも定義も変えずに通る', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO venues (venue_name) VALUES (?)')
      .bind(testVenueName)
      .run();
    const schemaBefore = await venueSchema();
    const before = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM venues'
    ).first<{ count: number }>();

    await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));

    const after = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM venues'
    ).first<{ count: number }>();
    expect(after?.count).toBe(before?.count);
    expect(await venueSchema()).toEqual(schemaBefore);
  });
});
