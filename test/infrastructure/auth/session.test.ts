import { describe, expect, it, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  buildSessionCookie,
  clearSessionCookie,
  createSession,
  deleteSession,
  getSession,
  getSessionIdFromCookie,
} from '../../../src/infrastructure/auth/session';
import type { Session } from '../../../src/domain/auth/types';

function buildSessionData(): Omit<Session, 'expires_at'> {
  return {
    user_id: 'user-1',
    oid: 'oid-1',
    tid: 'tid-1',
    sub: 'sub-1',
    email: 'tanaka@example.com',
    display_name: '田中太郎',
  };
}

function createMockKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as KVNamespace;
}

describe('session', () => {
  describe('createSession / getSession', () => {
    it('KV に session:<id> で保存し、getSession で取得できる', async () => {
      const kv = createMockKv();

      const sessionId = await createSession(kv, buildSessionData(), 3600);
      const session = await getSession(kv, sessionId);

      expect(session).toMatchObject(buildSessionData());
      expect(kv.put).toHaveBeenCalledWith(
        `session:${sessionId}`,
        expect.any(String),
        { expirationTtl: 3600 }
      );
    });

    it('存在しない sessionId の場合は null を返す', async () => {
      const kv = createMockKv();

      expect(await getSession(kv, 'unknown')).toBeNull();
    });

    it('expires_at が過去の場合は null を返す', async () => {
      const kv = createMockKv();
      const sessionId = 'expired-session';
      const expiredSession: Session = {
        ...buildSessionData(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };
      await kv.put(`session:${sessionId}`, JSON.stringify(expiredSession));

      expect(await getSession(kv, sessionId)).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('KV からセッションを削除する', async () => {
      const kv = createMockKv();
      const sessionId = await createSession(kv, buildSessionData(), 3600);

      await deleteSession(kv, sessionId);

      expect(kv.delete).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(await getSession(kv, sessionId)).toBeNull();
    });
  });

  describe('getSessionIdFromCookie', () => {
    it('Cookie ヘッダーから session の値を取り出す', () => {
      expect(getSessionIdFromCookie('session=abc123; other=xyz')).toBe(
        'abc123'
      );
    });

    it('先頭以外に session がある場合でも取り出せる', () => {
      expect(getSessionIdFromCookie('other=xyz; session=abc123')).toBe(
        'abc123'
      );
    });

    it('Cookie ヘッダーが null の場合は null を返す', () => {
      expect(getSessionIdFromCookie(null)).toBeNull();
    });

    it('session が含まれない場合は null を返す', () => {
      expect(getSessionIdFromCookie('other=xyz')).toBeNull();
    });
  });

  describe('buildSessionCookie / clearSessionCookie', () => {
    it('secure=true の場合は Secure 属性を含む Cookie 文字列を生成する', () => {
      const cookie = buildSessionCookie('session-id-1', 3600, true);

      expect(cookie).toBe(
        'session=session-id-1; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600'
      );
    });

    it('secure=false の場合は Secure 属性を含まない', () => {
      const cookie = buildSessionCookie('session-id-1', 3600, false);

      expect(cookie).toBe(
        'session=session-id-1; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600'
      );
    });

    it('clearSessionCookie は Max-Age=0 の Cookie を生成する', () => {
      expect(clearSessionCookie(true)).toBe(
        'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
      );
      expect(clearSessionCookie(false)).toBe(
        'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
      );
    });
  });
});
