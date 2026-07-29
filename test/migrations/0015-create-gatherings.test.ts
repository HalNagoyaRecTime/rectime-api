import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('集合予定の最終スキーマ', () => {
  it('gathering_group_idを持たず、集合メンバー・競技・集合場所を参照する', async () => {
    const columns = await env.DB.prepare('PRAGMA table_info(gatherings)').all<{
      name: string;
      notnull: number;
      pk: number;
      dflt_value: string | null;
    }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gathering_id', pk: 1 }),
        expect.objectContaining({
          name: 'gathering_group_member_id',
          notnull: 0,
        }),
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
    expect(columns.results.map(column => column.name)).not.toContain(
      'gathering_group_id'
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gatherings)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'gathering_group_members',
          from: 'gathering_group_member_id',
          to: 'gathering_group_member_id',
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
        expect.objectContaining({
          name: 'idx_gatherings_event_id',
          unique: 0,
        }),
        expect.objectContaining({
          name: 'idx_gatherings_spot_id',
          unique: 0,
        }),
      ])
    );
    expect(indexes.results.filter(index => index.unique === 1)).toEqual([
      expect.objectContaining({
        name: 'uq_gatherings_gathering_group_member_id',
        unique: 1,
      }),
    ]);

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });

  it('同じ競技に複数の集合を作成でき、存在しない参照先は拒否する', async () => {
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('migration集合イベント', '体育館', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('migration集合場所') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();

    try {
      const first = await env.DB.prepare(
        'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id, gathering_time, round'
      )
        .bind(event!.event_id, spot!.gathering_spot_id)
        .first<{
          gathering_id: number;
          gathering_time: string;
          round: number;
        }>();
      const second = await env.DB.prepare(
        'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
      )
        .bind(event!.event_id, spot!.gathering_spot_id)
        .first<{ gathering_id: number }>();

      expect(first).toMatchObject({ gathering_time: '99:59', round: 99 });
      expect(second!.gathering_id).not.toBe(first!.gathering_id);

      await expect(
        env.DB.prepare(
          'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?)'
        )
          .bind(999999, spot!.gathering_spot_id)
          .run()
      ).rejects.toThrow();
      await expect(
        env.DB.prepare(
          'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?)'
        )
          .bind(event!.event_id, 999999)
          .run()
      ).rejects.toThrow();
    } finally {
      await env.DB.prepare('DELETE FROM gatherings WHERE event_id = ?')
        .bind(event!.event_id)
        .run();
      await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
        .bind(event!.event_id)
        .run();
      await env.DB.prepare(
        'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
      )
        .bind(spot!.gathering_spot_id)
        .run();
    }
  });
});
