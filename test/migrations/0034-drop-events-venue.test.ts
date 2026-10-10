import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0034_drop_events_venue.sql'
  );
  if (!migration) {
    throw new Error(
      '0034_drop_events_venue.sql is not registered'
    );
  }
  return migration.queries;
})();

const createVenueTablesQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0035_create_venues_and_event_venues.sql'
  );
  if (!migration) {
    throw new Error('0035_create_venues_and_event_venues.sql is not registered');
  }
  return migration.queries;
})();

// 旧0033だけ適用済みの状態を再現する。テーブルを作り、その時点の events.venue から
// マスタと紐づけを作る(旧0033が行っていたデータ移行と同じ)。
async function applyOldMigration0033() {
  await env.DB.batch([
    ...createVenueTablesQueries.map(query => env.DB.prepare(query)),
    env.DB.prepare(
      `INSERT OR IGNORE INTO venues (venue_name)
       SELECT DISTINCT TRIM(venue, ' ' || CHAR(9, 10, 13, 12288))
       FROM events
       WHERE TRIM(venue, ' ' || CHAR(9, 10, 13, 12288)) <> ''`
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO event_venues (event_id, venue_id)
       SELECT events.event_id, venues.venue_id
       FROM events
       INNER JOIN venues
         ON venues.venue_name = TRIM(events.venue, ' ' || CHAR(9, 10, 13, 12288))`
    ),
  ]);
}

async function hasVenueColumn(): Promise<boolean> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM pragma_table_info('events') WHERE name = 'venue'"
  ).all();
  return results.length > 0;
}

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
    env.DB.prepare("DELETE FROM events WHERE event_name LIKE '0034移行確認%'"),
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

describe('0034_drop_events_venue.sql のデータ移行', () => {
  beforeEach(prepareBeforeMigration);

  it('重複する実施場所名は1件のマスタへまとまる', async () => {
    const firstEventId = await insertEvent('0034移行確認競技A', '0034移行確認体育館');
    const secondEventId = await insertEvent('0034移行確認競技B', '0034移行確認体育館');
    const thirdEventId = await insertEvent('0034移行確認競技C', '0034移行確認グラウンド');

    await runMigration();

    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM venues WHERE venue_name = ?'
    )
      .bind('0034移行確認体育館')
      .first<{ count: number }>();
    expect(row?.count).toBe(1);

    expect(await venueNamesOf(firstEventId)).toEqual(['0034移行確認体育館']);
    expect(await venueNamesOf(secondEventId)).toEqual(['0034移行確認体育館']);
    expect(await venueNamesOf(thirdEventId)).toEqual(['0034移行確認グラウンド']);
  });

  it('実施場所を持つ既存の競技すべてに紐づけが作られる', async () => {
    const firstEventId = await insertEvent(
      '0034移行確認競技D',
      '0034移行確認体育館'
    );
    const secondEventId = await insertEvent(
      '0034移行確認競技E',
      '0034移行確認プール'
    );

    await runMigration();

    expect(await venueNamesOf(firstEventId)).toEqual(['0034移行確認体育館']);
    expect(await venueNamesOf(secondEventId)).toEqual(['0034移行確認プール']);
  });

  it('前後に半角・全角の空白を含む実施場所名も同じマスタへまとまる', async () => {
    const eventId = await insertEvent('0034移行確認競技F', '  0034移行確認武道場  ');
    await insertEvent('0034移行確認競技G', '0034移行確認武道場');
    const fullWidthEventId = await insertEvent(
      '0034移行確認競技I',
      '\u30000034移行確認武道場\u3000'
    );

    await runMigration();

    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM venues WHERE venue_name = ?'
    )
      .bind('0034移行確認武道場')
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
    expect(await venueNamesOf(eventId)).toEqual(['0034移行確認武道場']);
    expect(await venueNamesOf(fullWidthEventId)).toEqual([
      '0034移行確認武道場',
    ]);
  });

  it('実施場所名の途中にある全角空白は残す', async () => {
    const eventId = await insertEvent(
      '0034移行確認競技J',
      '0034移行確認第1\u3000体育館'
    );

    await runMigration();

    expect(await venueNamesOf(eventId)).toEqual([
      '0034移行確認第1\u3000体育館',
    ]);
  });

  it('実施場所の列は移行後に削除される', async () => {
    await insertEvent('0034移行確認競技K', '0034移行確認体育館');

    await runMigration();

    const { results } = await env.DB.prepare(
      "SELECT name FROM pragma_table_info('events') WHERE name = 'venue'"
    ).all();
    expect(results).toHaveLength(0);
  });

  it('旧0033だけ適用済みで、events.venueとマスタが一致していれば通り、紐づけを保つ', async () => {
    const eventId = await insertEvent(
      '0034移行確認競技L',
      '0034移行確認体育館'
    );
    await applyOldMigration0033();
    expect(await venueNamesOf(eventId)).toEqual(['0034移行確認体育館']);

    await runMigration();

    expect(await venueNamesOf(eventId)).toEqual(['0034移行確認体育館']);
    expect(await hasVenueColumn()).toBe(false);
  });

  it('旧0033の後に、紐づけの無かった競技へ実施場所が設定されていれば、紐づけを作って通る', async () => {
    const eventId = await insertEvent('0034移行確認競技M', '');
    await applyOldMigration0033();
    expect(await venueNamesOf(eventId)).toEqual([]);
    await env.DB.prepare('UPDATE events SET venue = ? WHERE event_id = ?')
      .bind('0034移行確認グラウンド', eventId)
      .run();

    await runMigration();

    expect(await venueNamesOf(eventId)).toEqual(['0034移行確認グラウンド']);
    expect(await hasVenueColumn()).toBe(false);
  });

  describe('旧0033の後に、events.venueと紐づけが食い違っている場合は、データを変更せず移行を中断する', () => {
    async function expectAbortedWithoutChanges(eventId: number, before: string[]) {
      await expect(runMigration()).rejects.toThrow(
        /venue_mismatch_resolve_events_venue_and_event_venues_before_migrating/
      );
      // 中断した場合は、列の削除も、ここまでの変更も残らない。
      expect(await hasVenueColumn()).toBe(true);
      expect(await venueNamesOf(eventId)).toEqual(before);
      const { results } = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE name = '__migration_0034_guard'"
      ).all();
      expect(results).toHaveLength(0);
    }

    it('events.venueだけが更新された', async () => {
      const eventId = await insertEvent(
        '0034移行確認競技N',
        '0034移行確認体育館'
      );
      await applyOldMigration0033();
      await env.DB.prepare('UPDATE events SET venue = ? WHERE event_id = ?')
        .bind('0034移行確認グラウンド', eventId)
        .run();

      await expectAbortedWithoutChanges(eventId, ['0034移行確認体育館']);
    });

    it('events.venueが空文字にされた', async () => {
      const eventId = await insertEvent(
        '0034移行確認競技O',
        '0034移行確認体育館'
      );
      await applyOldMigration0033();
      await env.DB.prepare('UPDATE events SET venue = ? WHERE event_id = ?')
        .bind('', eventId)
        .run();

      await expectAbortedWithoutChanges(eventId, ['0034移行確認体育館']);
    });

    it('マスタが改名された(events.venueは旧名のまま)', async () => {
      const eventId = await insertEvent(
        '0034移行確認競技P',
        '0034移行確認体育館'
      );
      await applyOldMigration0033();
      await env.DB.prepare(
        'UPDATE venues SET venue_name = ? WHERE venue_name = ?'
      )
        .bind('0034移行確認グラウンド', '0034移行確認体育館')
        .run();

      // 改名したマスタ名が、events.venue で上書きされて巻き戻らない。
      await expectAbortedWithoutChanges(eventId, ['0034移行確認グラウンド']);
    });
  });

  it('実施場所が空文字の競技はマスタを作らない', async () => {
    const eventId = await insertEvent('0034移行確認競技H', '');

    await runMigration();

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM venues WHERE venue_name = ''"
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
    expect(await venueNamesOf(eventId)).toEqual([]);
  });
});
