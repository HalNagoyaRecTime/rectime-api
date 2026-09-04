import { env as workerEnv } from 'cloudflare:workers';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearerAuthenticationMiddleware } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import { signAccessToken } from '../../../src/infrastructure/auth/jwt';
import type { Env } from '../../../src/lib/env';

const JWT_SECRET = 'a'.repeat(32);

function buildEnv(overrides: Partial<Env> = {}): Partial<Env> {
  return { JWT_SECRET, DB: workerEnv.DB, ...overrides };
}

beforeEach(async () => {
  await workerEnv.DB.prepare('DELETE FROM gathering_group_members').run();
  await workerEnv.DB.prepare('DELETE FROM notification_schedules').run();
  await workerEnv.DB.prepare('DELETE FROM firebase_tokens').run();
  await workerEnv.DB.prepare('DELETE FROM microsoft_account_links').run();
  await workerEnv.DB.prepare('DELETE FROM staffs').run();
  await workerEnv.DB.prepare('DELETE FROM teachers').run();
  await workerEnv.DB.prepare('DELETE FROM students').run();
  await workerEnv.DB.prepare('DELETE FROM users').run();
});

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: AuthenticationVariables }>();
  app.use('*', bearerAuthenticationMiddleware);
  app.get('/', c =>
    c.json({ authenticatedUserId: c.get('authenticatedUserId') })
  );
  return app;
}

async function insertUser(
  userId: number,
  deletionStatus?: 'active' | 'deletion_pending' | 'deleted'
): Promise<void> {
  if (deletionStatus) {
    await workerEnv.DB.prepare(
      'INSERT INTO users (user_id, user_name, deletion_status) VALUES (?, ?, ?)'
    )
      .bind(userId, 'テストユーザー', deletionStatus)
      .run();
  } else {
    await workerEnv.DB.prepare(
      'INSERT INTO users (user_id, user_name) VALUES (?, ?)'
    )
      .bind(userId, 'テストユーザー')
      .run();
  }
}

describe('bearerAuthenticationMiddleware', () => {
  it('有効なBearerトークンがあれば認証済みuserIdをContextへ設定する', async () => {
    await insertUser(7);
    const app = buildApp();
    const token = await signAccessToken(
      {
        sub: '7',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );

    const response = await app.request(
      '/',
      { headers: { Authorization: `Bearer ${token}` } },
      buildEnv()
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticatedUserId: 7 });
  });

  it('deletion_statusがdeletion_pendingのユーザーは、有効期限内のAccess Tokenでも未認証として扱う', async () => {
    await insertUser(7, 'deletion_pending');
    const app = buildApp();
    const token = await signAccessToken(
      {
        sub: '7',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );

    const response = await app.request(
      '/',
      { headers: { Authorization: `Bearer ${token}` } },
      buildEnv()
    );

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });

  it('deletion_statusがdeletedのユーザーは、有効期限内のAccess Tokenでも未認証として扱う', async () => {
    await insertUser(7, 'deleted');
    const app = buildApp();
    const token = await signAccessToken(
      {
        sub: '7',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );

    const response = await app.request(
      '/',
      { headers: { Authorization: `Bearer ${token}` } },
      buildEnv()
    );

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });

  it('deletion_status確認中にD1がエラーを投げても、正当なJWTなら認証済みとして扱う', async () => {
    // D1の一時的な障害・タイムアウトのようなインフラ都合のエラーを、
    // JWT不正や削除済みと区別せず「未認証」に丸めてしまうと、DB障害時に
    // API全体が401になり得る。JWTの署名検証自体は成功している場合、
    // deletion_status確認側の予期しない失敗は認証を無効にしないことを
    // 確認する。
    await insertUser(7);
    const token = await signAccessToken(
      {
        sub: '7',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const failingDb = {
      prepare: () => {
        throw new Error('D1_ERROR: simulated outage');
      },
    } as unknown as Env['DB'];
    const app = buildApp();

    const response = await app.request(
      '/',
      { headers: { Authorization: `Bearer ${token}` } },
      buildEnv({ DB: failingDb })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticatedUserId: 7 });
  });

  it('Authorizationヘッダーが無い場合はnullをContextへ設定する', async () => {
    const app = buildApp();

    const response = await app.request('/', {}, buildEnv());

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });

  it('不正なBearerトークンの場合はnullとして扱う', async () => {
    const app = buildApp();

    const response = await app.request(
      '/',
      { headers: { Authorization: 'Bearer not-a-valid-jwt' } },
      buildEnv()
    );

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });

  it('X-Client-Typeが不正な値の場合はnullとして扱う', async () => {
    const app = buildApp();
    const token = await signAccessToken(
      {
        sub: '7',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );

    const response = await app.request(
      '/',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Client-Type': 'bogus',
        },
      },
      buildEnv()
    );

    expect(await response.json()).toEqual({ authenticatedUserId: null });
  });
});
