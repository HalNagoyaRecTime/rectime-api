import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0014_create_gathering_master_tables.sql', () => {
  it('集合場所・集合グループ・所属テーブルと制約を作成している', async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('gathering_spots', 'gathering_groups', 'gathering_group_members') ORDER BY name"
    ).all<{ name: string }>();
    expect(tables.results).toEqual([
      { name: 'gathering_group_members' },
      { name: 'gathering_groups' },
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

    const gatheringGroupColumns = await env.DB.prepare(
      'PRAGMA table_info(gathering_groups)'
    ).all<{ name: string; notnull: number; pk: number }>();
    expect(gatheringGroupColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gathering_group_id', pk: 1 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
        expect.objectContaining({ name: 'updated_at', notnull: 1 }),
      ])
    );
    expect(
      gatheringGroupColumns.results.map(column => column.name)
    ).not.toContain('gathering_group_name');
    expect(
      gatheringGroupColumns.results.map(column => column.name)
    ).not.toContain('user_id');

    const gatheringGroupMemberColumns = await env.DB.prepare(
      'PRAGMA table_info(gathering_group_members)'
    ).all<{ name: string; notnull: number; pk: number }>();
    expect(gatheringGroupMemberColumns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gathering_group_member_id', pk: 1 }),
        expect.objectContaining({ name: 'gathering_group_id', notnull: 1 }),
        expect.objectContaining({ name: 'user_id', notnull: 1 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
        expect.objectContaining({ name: 'updated_at', notnull: 1 }),
      ])
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gathering_group_members)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'gathering_groups',
          from: 'gathering_group_id',
          to: 'gathering_group_id',
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
      ])
    );

    const uniqueIndex = indexes.results.find(index => index.unique === 1);
    expect(uniqueIndex).toBeDefined();
    const uniqueIndexColumns = await env.DB.prepare(
      `PRAGMA index_info(${uniqueIndex!.name})`
    ).all<{ name: string }>();
    expect(uniqueIndexColumns.results.map(column => column.name)).toEqual([
      'gathering_group_id',
      'user_id',
    ]);

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
