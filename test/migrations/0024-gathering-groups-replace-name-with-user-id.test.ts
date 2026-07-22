import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0024_gathering_groups_replace_name_with_user_id.sql', () => {
  it('gathering_group_nameを廃止し、user_id（NOT NULL UNIQUE, users外部キー）に置き換える', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(gathering_groups)'
    ).all<{ name: string; notnull: number; pk: number }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gathering_group_id', pk: 1 }),
        expect.objectContaining({ name: 'user_id', notnull: 1 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
        expect.objectContaining({ name: 'updated_at', notnull: 1 }),
      ])
    );
    expect(
      columns.results.some(column => column.name === 'gathering_group_name')
    ).toBe(false);

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gathering_groups)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'users',
          from: 'user_id',
          to: 'user_id',
        }),
      ])
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(gathering_groups)'
    ).all<{ name: string; unique: number }>();
    const uniqueIndex = indexes.results.find(index => index.unique === 1);
    expect(uniqueIndex).toBeDefined();
    const uniqueIndexColumns = await env.DB.prepare(
      `PRAGMA index_info(${uniqueIndex!.name})`
    ).all<{ name: string }>();
    expect(uniqueIndexColumns.results.map(column => column.name)).toEqual([
      'user_id',
    ]);

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
