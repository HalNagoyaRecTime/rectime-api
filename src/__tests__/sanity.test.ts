import { env } from 'cloudflare:workers';
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('D1 binding が見える', () => {
    expect(env.DB).toBeDefined();
  });

  it('migrations が適用され t_events テーブルが存在する', async () => {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = 't_events'"
    ).first<{ name: string }>();

    expect(row?.name).toBe('t_events');
  });
});
