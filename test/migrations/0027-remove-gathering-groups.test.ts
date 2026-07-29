import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

const migrationQueries = (() => {
  const migration = env.TEST_MIGRATIONS.find(
    item => item.name === '0027_remove_gathering_groups.sql'
  );
  if (!migration) {
    throw new Error('0027_remove_gathering_groups.sql is not registered');
  }
  return migration.queries;
})();

async function prepareLegacySchema() {
  await env.DB.batch([
    env.DB.prepare('DROP INDEX IF EXISTS idx_gatherings_event_id'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_gatherings_spot_id'),
    env.DB.prepare('DROP INDEX IF EXISTS idx_gathering_group_members_user_id'),
    env.DB.prepare(
      'DROP INDEX IF EXISTS uq_gathering_group_members_gathering_user'
    ),
    env.DB.prepare(
      'ALTER TABLE gathering_group_members RENAME TO gathering_group_members_backup'
    ),
    env.DB.prepare('ALTER TABLE gatherings RENAME TO gatherings_backup'),
    env.DB.prepare(
      `CREATE TABLE gathering_groups (
        gathering_group_id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE gatherings (
        gathering_id INTEGER PRIMARY KEY AUTOINCREMENT,
        gathering_group_id INTEGER NOT NULL UNIQUE
          REFERENCES gathering_groups(gathering_group_id),
        event_id INTEGER NOT NULL REFERENCES events(event_id),
        gathering_spot_id INTEGER NOT NULL
          REFERENCES gathering_spots(gathering_spot_id),
        gathering_time TEXT NOT NULL DEFAULT '99:59',
        round INTEGER NOT NULL DEFAULT 99,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE gathering_group_members (
        gathering_group_member_id INTEGER PRIMARY KEY AUTOINCREMENT,
        gathering_group_id INTEGER NOT NULL
          REFERENCES gathering_groups(gathering_group_id),
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (gathering_group_id, user_id)
      )`
    ),
  ]);
}

async function restoreCurrentSchema() {
  await env.DB.prepare('PRAGMA legacy_alter_table = OFF').run();
  await env.DB.batch([
    env.DB.prepare('DROP TABLE IF EXISTS __migration_0027_guard'),
    env.DB.prepare('DROP TABLE IF EXISTS __migration_0027_sequences'),
    env.DB.prepare('DROP TABLE IF EXISTS gathering_group_members_new'),
    env.DB.prepare('DROP TABLE IF EXISTS gathering_group_members'),
    env.DB.prepare('DROP TABLE IF EXISTS gathering_group_members_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS gatherings_new'),
    env.DB.prepare('DROP TABLE IF EXISTS gatherings'),
    env.DB.prepare('DROP TABLE IF EXISTS gatherings_legacy'),
    env.DB.prepare('DROP TABLE IF EXISTS gathering_groups'),
    env.DB.prepare(
      'ALTER TABLE gatherings_backup RENAME TO gatherings'
    ),
    env.DB.prepare(
      'ALTER TABLE gathering_group_members_backup RENAME TO gathering_group_members'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_gatherings_event_id ON gatherings(event_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_gatherings_spot_id ON gatherings(gathering_spot_id)'
    ),
    env.DB.prepare(
      'CREATE INDEX idx_gathering_group_members_user_id ON gathering_group_members(user_id)'
    ),
    env.DB.prepare(
      'CREATE UNIQUE INDEX uq_gathering_group_members_gathering_user ON gathering_group_members(gathering_id, user_id)'
    ),
  ]);
}

async function runMigration() {
  await env.DB.batch(migrationQueries.map(query => env.DB.prepare(query)));
}

describe('0027_remove_gathering_groups.sql のデータ変換', () => {
  afterEach(async () => {
    await restoreCurrentSchema();
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name LIKE '0027移行確認%'"
    ).run();
    await env.DB.prepare(
      "DELETE FROM events WHERE event_name = '0027移行確認競技'"
    ).run();
    await env.DB.prepare(
      "DELETE FROM gathering_spots WHERE gathering_spot_name = '0027移行確認場所'"
    ).run();
  });

  it('IDと日時を保ち、複数メンバーをgathering_idへ付け替える', async () => {
    await prepareLegacySchema();
    const users = await env.DB.batch<{
      user_id: number;
    }>([
      env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('0027移行確認1') RETURNING user_id"
      ),
      env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('0027移行確認2') RETURNING user_id"
      ),
    ]);
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('0027移行確認競技', '体育館', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('0027移行確認場所') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();
    const group = await env.DB.prepare(
      'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
    ).first<{ gathering_group_id: number }>();
    await env.DB.prepare(
      `INSERT INTO gatherings (
        gathering_id, gathering_group_id, event_id, gathering_spot_id,
        gathering_time, round, created_at, updated_at
      ) VALUES (7001, ?, ?, ?, '08:45', 2, '2026-07-01 01:02:03', '2026-07-02 04:05:06')`
    )
      .bind(
        group!.gathering_group_id,
        event!.event_id,
        spot!.gathering_spot_id
      )
      .run();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO gathering_group_members (
          gathering_group_member_id, gathering_group_id, user_id,
          created_at, updated_at
        ) VALUES (8001, ?, ?, '2026-07-03 01:02:03', '2026-07-04 04:05:06')`
      ).bind(group!.gathering_group_id, users[0].results[0]!.user_id),
      env.DB.prepare(
        `INSERT INTO gathering_group_members (
          gathering_group_member_id, gathering_group_id, user_id,
          created_at, updated_at
        ) VALUES (8002, ?, ?, '2026-07-05 01:02:03', '2026-07-06 04:05:06')`
      ).bind(group!.gathering_group_id, users[1].results[0]!.user_id),
    ]);

    const deletedGroup = await env.DB.prepare(
      'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
    ).first<{ gathering_group_id: number }>();
    await env.DB.prepare(
      `INSERT INTO gatherings (
        gathering_id, gathering_group_id, event_id, gathering_spot_id
      ) VALUES (9000, ?, ?, ?)`
    )
      .bind(
        deletedGroup!.gathering_group_id,
        event!.event_id,
        spot!.gathering_spot_id
      )
      .run();
    await env.DB.prepare(
      `INSERT INTO gathering_group_members (
        gathering_group_member_id, gathering_group_id, user_id
      ) VALUES (9500, ?, ?)`
    )
      .bind(
        deletedGroup!.gathering_group_id,
        users[0].results[0]!.user_id
      )
      .run();
    await env.DB.prepare(
      'DELETE FROM gathering_group_members WHERE gathering_group_member_id = 9500'
    ).run();
    await env.DB.prepare(
      'DELETE FROM gatherings WHERE gathering_id = 9000'
    ).run();

    await env.DB.prepare('PRAGMA legacy_alter_table = ON').run();
    await runMigration();

    const groupTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gathering_groups'"
    ).first();
    expect(groupTable).toBeNull();
    const gathering = await env.DB.prepare(
      'SELECT * FROM gatherings WHERE gathering_id = 7001'
    ).first();
    expect(gathering).toMatchObject({
      gathering_id: 7001,
      event_id: event!.event_id,
      gathering_spot_id: spot!.gathering_spot_id,
      gathering_time: '08:45',
      round: 2,
      created_at: '2026-07-01 01:02:03',
      updated_at: '2026-07-02 04:05:06',
    });
    expect(gathering).not.toHaveProperty('gathering_group_id');

    const members = await env.DB.prepare(
      `SELECT gathering_group_member_id, gathering_id, user_id, created_at, updated_at
       FROM gathering_group_members
       ORDER BY gathering_group_member_id`
    ).all();
    expect(members.results).toEqual([
      {
        gathering_group_member_id: 8001,
        gathering_id: 7001,
        user_id: users[0].results[0]!.user_id,
        created_at: '2026-07-03 01:02:03',
        updated_at: '2026-07-04 04:05:06',
      },
      {
        gathering_group_member_id: 8002,
        gathering_id: 7001,
        user_id: users[1].results[0]!.user_id,
        created_at: '2026-07-05 01:02:03',
        updated_at: '2026-07-06 04:05:06',
      },
    ]);

    await expect(
      env.DB.prepare(
        'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (7001, ?)'
      )
        .bind(users[0].results[0]!.user_id)
        .run()
    ).rejects.toThrow();

    const nextGathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
    )
      .bind(event!.event_id, spot!.gathering_spot_id)
      .first<{ gathering_id: number }>();
    const nextMember = await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?) RETURNING gathering_group_member_id'
    )
      .bind(nextGathering!.gathering_id, users[0].results[0]!.user_id)
      .first<{ gathering_group_member_id: number }>();
    expect(nextGathering!.gathering_id).toBeGreaterThan(9000);
    expect(nextMember!.gathering_group_member_id).toBeGreaterThan(9500);

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
    const memberForeignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gathering_group_members)'
    ).all<{ table: string; from: string; to: string }>();
    expect(memberForeignKeys.results).toContainEqual(
      expect.objectContaining({
        table: 'gatherings',
        from: 'gathering_id',
        to: 'gathering_id',
      })
    );
  });

  it('移行前の全行が削除済みでもAUTOINCREMENTの高水位を保つ', async () => {
    await prepareLegacySchema();
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('0027移行確認全削除') RETURNING user_id"
    ).first<{ user_id: number }>();
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('0027移行確認競技', '体育館', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('0027移行確認場所') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();
    const group = await env.DB.prepare(
      'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
    ).first<{ gathering_group_id: number }>();
    await env.DB.prepare(
      `INSERT INTO gatherings (
        gathering_id, gathering_group_id, event_id, gathering_spot_id
      ) VALUES (9100, ?, ?, ?)`
    )
      .bind(
        group!.gathering_group_id,
        event!.event_id,
        spot!.gathering_spot_id
      )
      .run();
    await env.DB.prepare(
      `INSERT INTO gathering_group_members (
        gathering_group_member_id, gathering_group_id, user_id
      ) VALUES (9600, ?, ?)`
    )
      .bind(group!.gathering_group_id, user!.user_id)
      .run();
    await env.DB.prepare(
      'DELETE FROM gathering_group_members WHERE gathering_group_member_id = 9600'
    ).run();
    await env.DB.prepare(
      'DELETE FROM gatherings WHERE gathering_id = 9100'
    ).run();
    await env.DB.prepare(
      'DELETE FROM gathering_groups WHERE gathering_group_id = ?'
    )
      .bind(group!.gathering_group_id)
      .run();

    await env.DB.prepare('PRAGMA legacy_alter_table = ON').run();
    await runMigration();

    const nextGathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
    )
      .bind(event!.event_id, spot!.gathering_spot_id)
      .first<{ gathering_id: number }>();
    const nextMember = await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?) RETURNING gathering_group_member_id'
    )
      .bind(nextGathering!.gathering_id, user!.user_id)
      .first<{ gathering_group_member_id: number }>();
    expect(nextGathering!.gathering_id).toBeGreaterThan(9100);
    expect(nextMember!.gathering_group_member_id).toBeGreaterThan(9600);

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });

  it('集合へ変換できないメンバーがある場合はデータを残して中止する', async () => {
    await prepareLegacySchema();
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('0027移行確認孤立') RETURNING user_id"
    ).first<{ user_id: number }>();
    const group = await env.DB.prepare(
      'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
    ).first<{ gathering_group_id: number }>();
    await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_group_id, user_id) VALUES (?, ?)'
    )
      .bind(group!.gathering_group_id, user!.user_id)
      .run();

    await expect(runMigration()).rejects.toThrow('CHECK constraint failed');

    const member = await env.DB.prepare(
      'SELECT gathering_group_id, user_id FROM gathering_group_members'
    ).first();
    expect(member).toEqual({
      gathering_group_id: group!.gathering_group_id,
      user_id: user!.user_id,
    });
    const groupTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gathering_groups'"
    ).first();
    expect(groupTable).toEqual({ name: 'gathering_groups' });
  });
});
