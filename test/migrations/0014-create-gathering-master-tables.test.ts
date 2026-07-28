import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('集合場所・集合メンバーの最終スキーマ', () => {
  it('gathering_groupsを持たず、集合メンバーをgathering_idで管理する', async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('gathering_spots', 'gathering_groups', 'gathering_group_members') ORDER BY name"
    ).all<{ name: string }>();
    expect(tables.results).toEqual([
      { name: 'gathering_group_members' },
      { name: 'gathering_spots' },
    ]);

    const gatheringSpotColumns = await env.DB.prepare(
      'PRAGMA table_info(gathering_spots)'
    ).all<{ name: string; notnull: number; pk: number }>();
    expect(gatheringSpotColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gathering_spot_id', pk: 1 }),
        expect.objectContaining({ name: 'gathering_spot_name', notnull: 1 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
        expect.objectContaining({ name: 'updated_at', notnull: 1 }),
      ])
    );

    const memberColumns = await env.DB.prepare(
      'PRAGMA table_info(gathering_group_members)'
    ).all<{ name: string; notnull: number; pk: number }>();
    expect(memberColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gathering_group_member_id', pk: 1 }),
        expect.objectContaining({ name: 'gathering_id', notnull: 1 }),
        expect.objectContaining({ name: 'user_id', notnull: 1 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
        expect.objectContaining({ name: 'updated_at', notnull: 1 }),
      ])
    );
    expect(memberColumns.results.map(column => column.name)).not.toContain(
      'gathering_group_id'
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gathering_group_members)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'gatherings',
          from: 'gathering_id',
          to: 'gathering_id',
        }),
        expect.objectContaining({
          table: 'users',
          from: 'user_id',
          to: 'user_id',
        }),
      ])
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(gathering_group_members)'
    ).all<{ name: string; unique: number }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'idx_gathering_group_members_user_id',
          unique: 0,
        }),
        expect.objectContaining({
          name: 'uq_gathering_group_members_gathering_user',
          unique: 1,
        }),
      ])
    );

    const uniqueIndexColumns = await env.DB.prepare(
      'PRAGMA index_info(uq_gathering_group_members_gathering_user)'
    ).all<{ name: string }>();
    expect(uniqueIndexColumns.results.map(column => column.name)).toEqual([
      'gathering_id',
      'user_id',
    ]);

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
