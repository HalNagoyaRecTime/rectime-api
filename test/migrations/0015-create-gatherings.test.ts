import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0015_create_gatherings.sql', () => {
  it('集会情報テーブルのカラム、外部キー、一意制約、検索用indexを作成する', async () => {
    const columns = await env.DB.prepare('PRAGMA table_info(gatherings)').all<{
      name: string;
      notnull: number;
      pk: number;
      dflt_value: string | null;
    }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gathering_id', pk: 1 }),
        expect.objectContaining({ name: 'gathering_group_id', notnull: 1 }),
        expect.objectContaining({ name: 'event_id', notnull: 1 }),
        expect.objectContaining({ name: 'gathering_spot_id', notnull: 1 }),
        expect.objectContaining({
          name: 'gathering_time',
          notnull: 1,
          dflt_value: "'99:59'",
        }),
        expect.objectContaining({ name: 'round', notnull: 1, dflt_value: '99' }),
        expect.objectContaining({
          name: 'created_at',
          notnull: 1,
          dflt_value: 'CURRENT_TIMESTAMP',
        }),
        expect.objectContaining({
          name: 'updated_at',
          notnull: 1,
          dflt_value: 'CURRENT_TIMESTAMP',
        }),
      ])
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gatherings)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'gathering_groups',
          from: 'gathering_group_id',
          to: 'gathering_group_id',
        }),
        expect.objectContaining({
          table: 'events',
          from: 'event_id',
          to: 'event_id',
        }),
        expect.objectContaining({
          table: 'gathering_spots',
          from: 'gathering_spot_id',
          to: 'gathering_spot_id',
        }),
      ])
    );

    const indexes = await env.DB.prepare('PRAGMA index_list(gatherings)').all<{
      name: string;
      unique: number;
    }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'idx_gatherings_event_id', unique: 0 }),
        expect.objectContaining({ name: 'idx_gatherings_spot_id', unique: 0 }),
      ])
    );
    const uniqueIndex = indexes.results.find(index => index.unique === 1);
    expect(uniqueIndex).toBeDefined();
    const uniqueIndexColumns = await env.DB.prepare(
      `PRAGMA index_info(${uniqueIndex!.name})`
    ).all<{ name: string }>();
    expect(uniqueIndexColumns.results.map(column => column.name)).toEqual([
      'gathering_group_id',
    ]);

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });

  it('同一グループの重複作成と存在しない参照先を拒否する', async () => {
    let gatheringId: number | undefined;
    let groupId: number | undefined;
    let eventId: number | undefined;
    let spotId: number | undefined;

    try {
      const group = await env.DB.prepare(
        'INSERT INTO gathering_groups (gathering_group_name) VALUES (?) RETURNING gathering_group_id'
      )
        .bind('migration集会グループ')
        .first<{ gathering_group_id: number }>();
      groupId = group!.gathering_group_id;
      const event = await env.DB.prepare(
        'INSERT INTO events (user_id, event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?, ?) RETURNING event_id'
      )
        .bind(-1, 'migration集会イベント', '体育館', '0900', '1000')
        .first<{ event_id: number }>();
      eventId = event!.event_id;
      const spot = await env.DB.prepare(
        'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
      )
        .bind('migration集合場所')
        .first<{ gathering_spot_id: number }>();
      spotId = spot!.gathering_spot_id;
      const gathering = await env.DB.prepare(
        'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?) RETURNING gathering_id'
      )
        .bind(groupId, eventId, spotId)
        .first<{ gathering_id: number }>();
      gatheringId = gathering!.gathering_id;

      await expect(
        env.DB.prepare(
          'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?)'
        )
          .bind(groupId, eventId, spotId)
          .run()
      ).rejects.toThrow();
      await expect(
        env.DB.prepare(
          'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?)'
        )
          .bind(999999, eventId, spotId)
          .run()
      ).rejects.toThrow();
      await expect(
        env.DB.prepare(
          'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?)'
        )
          .bind(groupId, 999999, spotId)
          .run()
      ).rejects.toThrow();
      await expect(
        env.DB.prepare(
          'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?)'
        )
          .bind(groupId, eventId, 999999)
          .run()
      ).rejects.toThrow();
    } finally {
      if (gatheringId) {
        await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
          .bind(gatheringId)
          .run();
      }
      if (groupId) {
        await env.DB.prepare(
          'DELETE FROM gathering_groups WHERE gathering_group_id = ?'
        )
          .bind(groupId)
          .run();
      }
      if (eventId) {
        await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
          .bind(eventId)
          .run();
      }
      if (spotId) {
        await env.DB.prepare(
          'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
        )
          .bind(spotId)
          .run();
      }
    }
  });
});
