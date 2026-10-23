import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRefreshSessionRepository } from '../../../src/infrastructure/repositories/RefreshSessionRepository';
import type { RefreshSession } from '../../../src/domain/auth/types';

const repo = createRefreshSessionRepository(env.DB);

async function insertUser(): Promise<string> {
  const row = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('田中太郎') RETURNING user_id"
  ).first<{ user_id: number }>();
  return String(row!.user_id);
}

function buildSession(
  refreshTokenId: string,
  userId: string,
  overrides: Partial<RefreshSession> = {}
): RefreshSession {
  return {
    refresh_token_id: refreshTokenId,
    user_id: userId,
    oid: 'oid-1',
    tid: 'tid-1',
    sub: 'sub-1',
    email: 'tanaka@example.com',
    display_name: '田中太郎',
    avatar_updated_at: null,
    client_type: 'mobile',
    ms_refresh_token: 'ms-refresh-1',
    ...overrides,
  };
}

describe('RefreshSessionRepository', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM refresh_sessions').run();
    await env.DB.prepare('DELETE FROM users').run();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('保存したセッションをIDで読み出せる', async () => {
    const userId = await insertUser();
    const session = buildSession('refresh-1', userId, { client_type: 'web' });

    await repo.create(session, 3600);

    await expect(repo.findById('refresh-1')).resolves.toEqual(session);
  });

  it('期限切れのセッションは読み出せない', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    const userId = await insertUser();
    await repo.create(buildSession('refresh-1', userId), 3600);
    vi.setSystemTime(Date.parse('2026-11-27T01:00:00Z'));

    await expect(repo.findById('refresh-1')).resolves.toBeNull();
    await expect(repo.findLatestByUserId(userId)).resolves.toBeNull();
  });

  it('ローテーションすると新しいIDで読み出せ、古いIDは使えなくなる', async () => {
    const userId = await insertUser();
    const session = buildSession('refresh-1', userId);
    await repo.create(session, 3600);

    await repo.rotate(session, 'refresh-2', 'ms-refresh-2', 3600);

    await expect(repo.findById('refresh-1')).resolves.toBeNull();
    await expect(repo.findById('refresh-2')).resolves.toEqual(
      buildSession('refresh-2', userId, { ms_refresh_token: 'ms-refresh-2' })
    );
  });

  it('同じセッションを同時にローテーションしても、どちらの新しいIDも使える', async () => {
    const userId = await insertUser();
    const session = buildSession('refresh-1', userId);
    await repo.create(session, 3600);

    await repo.rotate(session, 'refresh-2', 'ms-refresh-2', 3600);
    await repo.rotate(session, 'refresh-3', 'ms-refresh-3', 3600);

    await expect(repo.findById('refresh-1')).resolves.toBeNull();
    await expect(repo.findById('refresh-2')).resolves.not.toBeNull();
    await expect(repo.findById('refresh-3')).resolves.not.toBeNull();
  });

  it('ローテーションで有効期限が延びる', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    const userId = await insertUser();
    const session = buildSession('refresh-1', userId);
    await repo.create(session, 3600);
    vi.setSystemTime(Date.parse('2026-11-27T00:30:00Z'));
    await repo.rotate(session, 'refresh-2', 'ms-refresh-2', 3600);
    vi.setSystemTime(Date.parse('2026-11-27T01:10:00Z'));

    await expect(repo.findById('refresh-2')).resolves.not.toBeNull();
  });

  it('findLatestByUserIdは最後にログインまたはローテーションしたセッションを返す', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    const userId = await insertUser();
    const web = buildSession('refresh-web', userId);
    await repo.create(web, 3600);
    vi.setSystemTime(Date.parse('2026-11-27T00:01:00Z'));
    await repo.create(buildSession('refresh-mobile', userId), 3600);
    vi.setSystemTime(Date.parse('2026-11-27T00:02:00Z'));
    await repo.rotate(web, 'refresh-web-2', 'ms-refresh-2', 3600);
    vi.setSystemTime(Date.parse('2026-11-27T00:03:00Z'));
    await repo.update(
      'refresh-mobile',
      { avatar_updated_at: '2026-11-27T00:03:00.000Z' },
      3600
    );

    const latest = await repo.findLatestByUserId(userId);

    expect(latest?.refresh_token_id).toBe('refresh-web-2');
  });

  it('updateは指定した項目だけを書き換える', async () => {
    const userId = await insertUser();
    await repo.create(buildSession('refresh-1', userId), 3600);

    await repo.update('refresh-1', { ms_refresh_token: 'ms-refresh-2' }, 3600);
    await repo.update(
      'refresh-1',
      { avatar_updated_at: '2026-11-27T00:00:00.000Z' },
      3600
    );

    await expect(repo.findById('refresh-1')).resolves.toEqual(
      buildSession('refresh-1', userId, {
        ms_refresh_token: 'ms-refresh-2',
        avatar_updated_at: '2026-11-27T00:00:00.000Z',
      })
    );
  });

  it('updateで有効期限が延びる', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    const userId = await insertUser();
    await repo.create(buildSession('refresh-1', userId), 3600);
    vi.setSystemTime(Date.parse('2026-11-27T00:30:00Z'));
    await repo.update('refresh-1', { ms_refresh_token: 'ms-refresh-2' }, 3600);
    vi.setSystemTime(Date.parse('2026-11-27T01:10:00Z'));

    await expect(repo.findById('refresh-1')).resolves.not.toBeNull();
  });

  it('cleanupForUserは指定IDが本人のものなら削除し、他人のものは残す', async () => {
    const userId = await insertUser();
    const otherUserId = await insertUser();
    await repo.create(buildSession('own', userId), 3600);
    await repo.create(buildSession('other', otherUserId), 3600);

    await repo.cleanupForUser(userId, 'own');
    await repo.cleanupForUser(userId, 'other');

    await expect(repo.findById('own')).resolves.toBeNull();
    await expect(repo.findById('other')).resolves.not.toBeNull();
  });

  it('cleanupForUserはID未指定なら最後に更新したセッションだけを削除する', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    const userId = await insertUser();
    await repo.create(buildSession('older', userId), 3600);
    vi.setSystemTime(Date.parse('2026-11-27T00:01:00Z'));
    await repo.create(buildSession('newer', userId), 3600);

    await repo.cleanupForUser(userId);

    await expect(repo.findById('older')).resolves.not.toBeNull();
    await expect(repo.findById('newer')).resolves.toBeNull();
  });

  it('deleteByUserIdは本人のセッションをすべて削除する', async () => {
    const userId = await insertUser();
    const otherUserId = await insertUser();
    await repo.create(buildSession('web', userId), 3600);
    await repo.create(buildSession('mobile', userId), 3600);
    await repo.create(buildSession('other', otherUserId), 3600);

    await repo.deleteByUserId(userId);

    await expect(repo.findById('web')).resolves.toBeNull();
    await expect(repo.findById('mobile')).resolves.toBeNull();
    await expect(repo.findById('other')).resolves.not.toBeNull();
  });

  it('deleteExpiredは期限切れのセッションだけを削除する', async () => {
    vi.useFakeTimers({
      now: Date.parse('2026-11-27T00:00:00Z'),
      toFake: ['Date'],
    });
    const userId = await insertUser();
    await repo.create(buildSession('expired', userId), 3600);
    await repo.create(buildSession('alive', userId), 7200);
    vi.setSystemTime(Date.parse('2026-11-27T01:00:00Z'));

    await repo.deleteExpired();

    const rows = await env.DB.prepare(
      'SELECT refresh_token_id FROM refresh_sessions'
    ).all<{ refresh_token_id: string }>();
    expect(rows.results).toEqual([{ refresh_token_id: 'alive' }]);
  });
});
