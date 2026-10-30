import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

async function insertUser(): Promise<number> {
  const row = await env.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('スキーマテスト') RETURNING user_id"
  ).first<{ user_id: number }>();
  return row!.user_id;
}

function insertRefreshSession(
  refreshTokenId: string,
  userId: number,
  clientType = 'mobile'
) {
  return env.DB.prepare(
    `INSERT INTO refresh_sessions (
       refresh_token_id, user_id, client_type, oid, tid, sub, email,
       display_name, ms_refresh_token, created_at, updated_at, expires_at
     ) VALUES (?, ?, ?, 'oid', 'tid', 'sub', 'a@example.com', '名前', 'ms',
       '2026-11-27T00:00:00.000Z', '2026-11-27T00:00:00.000Z',
       '2026-11-28T00:00:00.000Z')`
  )
    .bind(refreshTokenId, userId, clientType)
    .run();
}

function insertAuthState(state: string, clientType: string, purpose: string) {
  return env.DB.prepare(
    `INSERT INTO auth_states (
       state, client_type, purpose, nonce, created_at, expires_at
     ) VALUES (?, ?, ?, 'nonce', '2026-11-27T00:00:00.000Z',
       '2026-11-27T00:10:00.000Z')`
  )
    .bind(state, clientType, purpose)
    .run();
}

describe('auth_states / refresh_sessions テーブルの制約', () => {
  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM auth_states').run();
    await env.DB.prepare('DELETE FROM refresh_sessions').run();
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name = 'スキーマテスト'"
    ).run();
  });

  it('ユーザーを削除すると、そのユーザーのRefresh Sessionも削除される', async () => {
    const userId = await insertUser();
    const otherUserId = await insertUser();
    await insertRefreshSession('own', userId);
    await insertRefreshSession('other', otherUserId);

    await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
      .bind(userId)
      .run();

    const rows = await env.DB.prepare(
      'SELECT refresh_token_id FROM refresh_sessions'
    ).all<{ refresh_token_id: string }>();
    expect(rows.results).toEqual([{ refresh_token_id: 'other' }]);
  });

  it('存在しないユーザーのRefresh Sessionは保存できない', async () => {
    await expect(insertRefreshSession('orphan', 999999)).rejects.toThrow();
  });

  it('Refresh Sessionのclient_typeはwebとmobile以外を保存できない', async () => {
    const userId = await insertUser();

    await expect(
      insertRefreshSession('invalid', userId, 'desktop')
    ).rejects.toThrow();
  });

  it('stateのclient_typeはwebとmobile以外を保存できない', async () => {
    await expect(
      insertAuthState('invalid-client', 'desktop', 'login')
    ).rejects.toThrow();
  });

  it('stateのpurposeはloginとaccount_deletion以外を保存できない', async () => {
    await expect(
      insertAuthState('invalid-purpose', 'web', 'signup')
    ).rejects.toThrow();
  });

  it('同じstateは2件保存できない', async () => {
    await insertAuthState('duplicate', 'web', 'login');

    await expect(
      insertAuthState('duplicate', 'mobile', 'login')
    ).rejects.toThrow();
  });
});
