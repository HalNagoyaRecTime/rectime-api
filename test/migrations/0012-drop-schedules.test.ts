import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0012_drop_schedules.sql', () => {
  it('m_schedulesを削除している', async () => {
    const table = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'm_schedules'"
    ).first<{ name: string }>();

    expect(table).toBeNull();
  });
});
