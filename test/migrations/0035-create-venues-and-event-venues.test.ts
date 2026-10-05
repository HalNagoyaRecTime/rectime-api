import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

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

describe('0035_create_venues_and_event_venues.sql', () => {
  it('マスタが既にある環境で実行しても、データを変えずに通る', async () => {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO venues (venue_name) VALUES ('0035再実行確認体育館')"
    ).run();
    const before = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM venues'
    ).first<{ count: number }>();

    await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));

    const after = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM venues'
    ).first<{ count: number }>();
    expect(after?.count).toBe(before?.count);

    await env.DB.prepare(
      "DELETE FROM venues WHERE venue_name = '0035再実行確認体育館'"
    ).run();
  });
});
