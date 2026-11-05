import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthStateRepository } from '../../../src/infrastructure/repositories/AuthStateRepository';
import type { PkceEntry } from '../../../src/domain/auth/types';

const repo = createAuthStateRepository(env.DB);

const mobileEntry: PkceEntry = {
  nonce: 'nonce-1',
  client_type: 'mobile',
  purpose: 'login',
  desktop_redirect_uri: 'http://127.0.0.1:8765/callback',
  created_at: '2026-11-27T00:00:00.000Z',
};

const webEntry: PkceEntry = {
  nonce: 'nonce-2',
  client_type: 'web',
  purpose: 'account_deletion',
  code_verifier: 'verifier',
  frontend_origin: 'https://admin.example.com',
  created_at: '2026-11-27T00:00:00.000Z',
};

describe('AuthStateRepository', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM auth_states').run();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('保存したstateを同じ内容で読み出せる', async () => {
    await repo.create('state-mobile', mobileEntry, 600);
    await repo.create('state-web', webEntry, 600);

    await expect(repo.find('state-mobile')).resolves.toEqual(mobileEntry);
    await expect(repo.find('state-web')).resolves.toEqual(webEntry);
  });

  it('有効なstateと同じstateは保存できない', async () => {
    await expect(repo.create('state-1', mobileEntry, 600)).resolves.toBe(true);
    await expect(repo.create('state-1', webEntry, 600)).resolves.toBe(false);
    await expect(repo.find('state-1')).resolves.toEqual(mobileEntry);
  });

  it('期限切れのstateと同じstateは保存し直せる', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    await repo.create('state-1', mobileEntry, 600);
    vi.setSystemTime(Date.parse('2026-11-27T00:10:00Z'));

    await expect(repo.create('state-1', webEntry, 600)).resolves.toBe(true);
    await expect(repo.find('state-1')).resolves.toEqual(webEntry);
  });

  it('consumeしたstateは返した後に削除され、2回目はnullになる', async () => {
    await repo.create('state-1', mobileEntry, 600);

    await expect(repo.consume('state-1')).resolves.toEqual(mobileEntry);
    await expect(repo.consume('state-1')).resolves.toBeNull();
    await expect(repo.find('state-1')).resolves.toBeNull();
  });

  it('期限切れのstateはfindでもconsumeでも返さない', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    await repo.create('state-1', mobileEntry, 600);
    await repo.create('state-2', mobileEntry, 600);
    vi.setSystemTime(Date.parse('2026-11-27T00:10:00Z'));

    await expect(repo.find('state-1')).resolves.toBeNull();
    await expect(repo.consume('state-2')).resolves.toBeNull();
  });

  it('deleteExpiredは期限切れのstateだけを削除する', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    await repo.create('expired', mobileEntry, 600);
    await repo.create('alive', mobileEntry, 3600);
    vi.setSystemTime(Date.parse('2026-11-27T00:10:00Z'));

    await repo.deleteExpired();

    const rows = await env.DB.prepare(
      'SELECT state FROM auth_states ORDER BY state'
    ).all<{ state: string }>();
    expect(rows.results).toEqual([{ state: 'alive' }]);
  });
});
