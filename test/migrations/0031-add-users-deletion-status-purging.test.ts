import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0031_add_users_deletion_status_purging.sql', () => {
  it('purged_atカラムが追加され、既定でNULLになる', async () => {
    const columns = await env.DB.prepare('PRAGMA table_info(users)').all<{
      name: string;
      notnull: number;
    }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'purged_at', notnull: 0 }),
      ])
    );
  });
});
