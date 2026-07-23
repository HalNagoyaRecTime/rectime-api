import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0023_drop_gathering_group_name.sql', () => {
  it('gathering_groupsから集合グループ名カラムを削除している', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(gathering_groups)'
    ).all<{ name: string }>();

    expect(columns.results.map(column => column.name)).not.toContain(
      'gathering_group_name'
    );
  });
});
