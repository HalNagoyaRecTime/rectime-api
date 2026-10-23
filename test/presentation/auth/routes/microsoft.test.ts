import { env as workerEnv } from 'cloudflare:workers';
import { Hono, type Context } from 'hono';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { microsoft } from '../../../../src/presentation/auth/routes/microsoft';
import { account } from '../../../../src/presentation/auth/routes/account';
import { verifyAccessToken } from '../../../../src/infrastructure/auth/jwt';
import { generateRandom } from '../../../../src/infrastructure/auth/pkce';
import { toBase64URL } from '../../../../src/infrastructure/auth/base64url';
import type { Env } from '../../../../src/lib/env';
import type {
  PkceEntry,
  DeletionConfirmationEntry,
} from '../../../../src/domain/auth/types';
import {
  diContainerMiddleware,
  type ContainerVariables,
} from '../../../../src/presentation/middleware/diContainer';
import { insertClassRoomWithTeam } from '../../../fixtures/classRooms';
import { createUserRepository } from '../../../../src/infrastructure/repositories/UserRepository';
import { createAuthStateRepository } from '../../../../src/infrastructure/repositories/AuthStateRepository';
import { createRefreshSessionRepository } from '../../../../src/infrastructure/repositories/RefreshSessionRepository';

const JWT_SECRET = 'a'.repeat(32);
const KID = 'test-kid';
const CLIENT_ID = 'client-1';
const TENANT = 'common';

let clientPrivateKeyPem: string;
let idTokenKeyPair: CryptoKeyPair;
let idTokenJwk: JsonWebKey & { kid: string };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

beforeAll(async () => {
  const clientKeyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey(
    'pkcs8',
    clientKeyPair.privateKey
  )) as ArrayBuffer;
  clientPrivateKeyPem = `-----BEGIN PRIVATE KEY-----\n${arrayBufferToBase64(pkcs8)}\n-----END PRIVATE KEY-----`;

  idTokenKeyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const exportedJwk = (await crypto.subtle.exportKey(
    'jwk',
    idTokenKeyPair.publicKey
  )) as JsonWebKey;
  idTokenJwk = { ...exportedJwk, kid: KID };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await workerEnv.DB.prepare('DELETE FROM auth_states').run();
  await workerEnv.DB.prepare('DELETE FROM refresh_sessions').run();
  await workerEnv.DB.prepare('DELETE FROM gathering_group_members').run();
  await workerEnv.DB.prepare('DELETE FROM notification_schedules').run();
  await workerEnv.DB.prepare('DELETE FROM gatherings').run();
  await workerEnv.DB.prepare('DELETE FROM events').run();
  await workerEnv.DB.prepare('DELETE FROM microsoft_account_links').run();
  await workerEnv.DB.prepare('DELETE FROM staffs').run();
  await workerEnv.DB.prepare(
    'UPDATE class_rooms SET teacher_id = NULL WHERE teacher_id IS NOT NULL'
  ).run();
  await workerEnv.DB.prepare('DELETE FROM teachers').run();
  await workerEnv.DB.prepare('DELETE FROM students').run();
  await workerEnv.DB.prepare('DELETE FROM users').run();
});

function buildEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: workerEnv.DB,
    AUTH_KV: createMockKv(),
    IMAGES: workerEnv.IMAGES,
    IMAGES_BUCKET_URL: 'https://r2.example.com/rectime-images',
    R2_ACCESS_KEY_ID: 'test-access-key-id',
    R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
    MASTER_IMPORT_COMMIT_LOCK: {} as Env['MASTER_IMPORT_COMMIT_LOCK'],
    NOTIFICATION_DELIVERY_QUEUE: {} as Env['NOTIFICATION_DELIVERY_QUEUE'],
    ALLOWED_ORIGINS: '',
    FIREBASE_PROJECT_ID: 'project',
    FIREBASE_CLIENT_EMAIL: 'sa@example.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: 'dummy-key',
    MICROSOFT_CLIENT_ID: CLIENT_ID,
    MICROSOFT_CLIENT_PRIVATE_KEY: clientPrivateKeyPem,
    MICROSOFT_CERT_THUMBPRINT: 'thumbprint',
    MICROSOFT_TENANT: TENANT,
    ALLOWED_MICROSOFT_TENANTS: 'tid-1',
    MICROSOFT_MOBILE_REDIRECT_URI: 'com.example.app://auth/callback',
    FRONTEND_URL: 'https://app.example.com',
    JWT_SECRET,
    JWT_EXPIRES_SEC: '3600',
    MOBILE_REFRESH_EXPIRES_SEC: '2592000',
    STUDENT_EMAIL_DOMAIN: 'nhs.hal.ac.jp',
    ...overrides,
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

async function putAuthState(state: string, entry: PkceEntry) {
  await createAuthStateRepository(workerEnv.DB).create(state, entry, 600);
}

async function expireAuthState(state: string) {
  await workerEnv.DB.prepare(
    "UPDATE auth_states SET expires_at = '2000-01-01T00:00:00.000Z' WHERE state = ?"
  )
    .bind(state)
    .run();
}

function findAuthState(state: string) {
  return createAuthStateRepository(workerEnv.DB).find(state);
}

function findRefreshSession(refreshTokenId: string) {
  return createRefreshSessionRepository(workerEnv.DB).findById(refreshTokenId);
}

async function countRefreshSessions() {
  const row = await workerEnv.DB.prepare(
    'SELECT COUNT(*) AS count FROM refresh_sessions'
  ).first<{ count: number }>();
  return row?.count;
}

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', diContainerMiddleware);
  app.route('/', microsoft);
  return app;
}

// プロフィール取得(authProfileService.getProfile)がD1の一時障害等で失敗する
// ケースを再現するためのapp。Refresh Sessionの保存より前にこの失敗を検知できていれば、
// Refresh Sessionは保存されないはず。
function buildAppWithFailingStudentLookup() {
  const app = new Hono<{ Bindings: Env; Variables: ContainerVariables }>();
  app.use('*', diContainerMiddleware);
  app.use('*', async (c, next) => {
    const container = c.get('container');
    container.authProfileService.getProfile = vi
      .fn()
      .mockRejectedValue(new Error('D1 transient failure'));
    await next();
  });
  app.route('/', microsoft);
  return app;
}

async function signIdToken(claims: Record<string, unknown>): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const headerB64 = toBase64URL(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadB64 = toBase64URL(
    new TextEncoder().encode(JSON.stringify(claims))
  );
  const data = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    idTokenKeyPair.privateKey,
    new TextEncoder().encode(data)
  );
  return `${data}.${toBase64URL(new Uint8Array(signature))}`;
}

function stubMicrosoftFetch(idToken: string) {
  const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/discovery/v2.0/keys')) {
      return new Response(JSON.stringify({ keys: [idTokenJwk] }), {
        status: 200,
      });
    }
    if (url.includes('/oauth2/v2.0/token')) {
      return new Response(
        JSON.stringify({
          id_token: idToken,
          access_token: 'ms-access-token',
          refresh_token: 'ms-refresh-token',
        }),
        { status: 200 }
      );
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

interface LoginRequestInput {
  attemptId: string;
  oid: string;
  sub: string;
  name: string;
  email: string;
}

async function requestMicrosoftLogin(
  env: Env,
  input: LoginRequestInput,
  clientType: 'web' | 'mobile'
) {
  const nonce = `nonce-${input.attemptId}`;
  const state = `state-${input.attemptId}`;
  const codeVerifier = generateRandom(32);
  const now = Math.floor(Date.now() / 1000);
  const idToken = await signIdToken({
    sub: input.sub,
    oid: input.oid,
    tid: 'tid-1',
    name: input.name,
    preferred_username: input.email,
    nonce,
    iss: 'https://login.microsoftonline.com/tid-1/v2.0',
    aud: CLIENT_ID,
    exp: now + 3600,
    iat: now - 10,
  });
  await putAuthState(state, {
    ...(clientType === 'web' ? { code_verifier: codeVerifier } : {}),
    nonce,
    client_type: clientType,
    purpose: 'login',
    created_at: new Date().toISOString(),
  });
  stubMicrosoftFetch(idToken);

  return buildApp().request(
    '/token',
    {
      method: 'POST',
      headers: {
        'X-Client-Type': clientType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: `auth-code-${input.attemptId}`,
        state,
        ...(clientType === 'mobile' ? { code_verifier: codeVerifier } : {}),
      }),
    },
    env
  );
}

function requestWebLogin(env: Env, input: LoginRequestInput) {
  return requestMicrosoftLogin(env, input, 'web');
}

function requestMobileLogin(env: Env, input: LoginRequestInput) {
  return requestMicrosoftLogin(env, input, 'mobile');
}

describe('GET /auth/microsoft/login', () => {
  it('不正なclient_typeの場合は400を返す', async () => {
    const app = buildApp();
    const res = await app.request(
      '/login',
      { headers: { 'X-Client-Type': 'bogus' } },
      buildEnv()
    );
    expect(res.status).toBe(400);
  });

  it('mobileはX-State/X-PKCE-Code-Challengeが無いと400を返す', async () => {
    const app = buildApp();
    const res = await app.request(
      '/login',
      { headers: { 'X-Client-Type': 'mobile' } },
      buildEnv()
    );
    expect(res.status).toBe(400);
  });

  it('mobileは同じstateで開始済みの場合は400を返す', async () => {
    const env = buildEnv();
    const state = generateRandom(32);
    await putAuthState(state, {
      nonce: 'n',
      client_type: 'mobile',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await app.request(
      '/login',
      {
        headers: {
          'X-Client-Type': 'mobile',
          'X-State': state,
          'X-PKCE-Code-Challenge': generateRandom(32),
        },
      },
      env
    );
    expect(res.status).toBe(400);
  });

  it('mobileは有効なパラメータでauth_urlを返しstateをclient_type: mobileで保存する', async () => {
    const env = buildEnv();
    const state = generateRandom(32);
    const codeChallenge = generateRandom(32);
    const app = buildApp();

    const res = await app.request(
      '/login',
      {
        headers: {
          'X-Client-Type': 'mobile',
          'X-State': state,
          'X-PKCE-Code-Challenge': codeChallenge,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { auth_url: string };
    expect(body.auth_url).toContain('login.microsoftonline.com');
    expect(body.auth_url).toContain(
      encodeURIComponent(env.MICROSOFT_MOBILE_REDIRECT_URI)
    );

    const stored = (await findAuthState(state)) as PkceEntry;
    expect(stored.client_type).toBe('mobile');
    expect(stored.code_verifier).toBeUndefined();
  });

  it('webはMicrosoftへ302リダイレクトし、code_verifier付き・client_type: webでstateを保存する', async () => {
    const env = buildEnv();
    const app = buildApp();

    const res = await app.request('/login', {}, env);

    expect(res.status).toBe(302);
    const location = res.headers.get('Location') ?? '';
    expect(location).toContain('login.microsoftonline.com');
    // redirect_uriは固定secretではなく、リクエスト自身のオリジンから動的に
    // 組み立てられる(webはMICROSOFT_REDIRECT_URIを持たない)。
    expect(new URL(location).searchParams.get('redirect_uri')).toBe(
      'http://localhost/api/v1/auth/microsoft/callback'
    );
    // 通常ログインはprompt=select_accountのまま
    // (削除確認フローのみprompt=loginへ切り替える)。
    expect(new URL(location).searchParams.get('prompt')).toBe('select_account');

    const state = new URL(location).searchParams.get('state') as string;
    const stored = (await findAuthState(state)) as PkceEntry;
    expect(stored.client_type).toBe('web');
    expect(stored.code_verifier).toBeTruthy();
  });
});

describe('GET /auth/microsoft/login origin', () => {
  it('webは許可済みRefererのoriginをPKCE stateに保存する', async () => {
    const env = buildEnv({
      ALLOWED_ORIGINS: 'https://*.recwatch.pages.dev',
    });
    const app = buildApp();

    const res = await app.request(
      '/login',
      {
        headers: {
          Referer: 'https://pr-296.recwatch.pages.dev/login',
        },
      },
      env
    );

    expect(res.status).toBe(302);
    const state = new URL(res.headers.get('Location') ?? '').searchParams.get(
      'state'
    ) as string;
    const stored = (await findAuthState(state)) as PkceEntry;
    expect(stored.frontend_origin).toBe('https://pr-296.recwatch.pages.dev');
  });

  it('webは未許可RefererのoriginをPKCE stateに保存しない', async () => {
    const env = buildEnv({
      ALLOWED_ORIGINS: 'https://*.recwatch.pages.dev',
    });
    const app = buildApp();

    const res = await app.request(
      '/login',
      {
        headers: {
          Referer: 'https://evil.example/login',
        },
      },
      env
    );

    expect(res.status).toBe(302);
    const state = new URL(res.headers.get('Location') ?? '').searchParams.get(
      'state'
    ) as string;
    const stored = (await findAuthState(state)) as PkceEntry;
    expect(stored.frontend_origin).toBeUndefined();
  });
});

describe('GET /auth/microsoft/callback', () => {
  it('state付きのerrorクエリはフロントエンドのcallbackへ中継する', async () => {
    const app = buildApp();
    const res = await app.request(
      '/callback?error=access_denied&state=state%2B123',
      {},
      buildEnv()
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      'https://app.example.com/auth/callback?error=access_denied&state=state%2B123'
    );
  });

  it('stateが無いerrorクエリはログイン画面へリダイレクトする', async () => {
    const app = buildApp();
    const res = await app.request(
      '/callback?error=access_denied',
      {},
      buildEnv()
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      'https://app.example.com/login?error=auth_failed'
    );
  });

  it('code/stateが無い場合はログイン画面へリダイレクトする', async () => {
    const app = buildApp();
    const res = await app.request('/callback', {}, buildEnv());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      'https://app.example.com/login?error=auth_failed'
    );
  });

  it('code/stateがある場合はトークン交換をせずフロントエンドのcallbackへ中継する', async () => {
    const app = buildApp();
    const res = await app.request(
      '/callback?code=abc%2B123&state=xyz789',
      {},
      buildEnv()
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      'https://app.example.com/auth/callback?code=abc%2B123&state=xyz789'
    );
  });
  it('有効なstateのoriginを成功時に復元し、callbackでstateを消費しない', async () => {
    const env = buildEnv({
      ALLOWED_ORIGINS: 'https://*.recwatch.pages.dev',
    });
    const state = 'state-preview';
    await putAuthState(state, {
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      frontend_origin: 'https://pr-296.recwatch.pages.dev',
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await app.request(`/callback?code=abc&state=${state}`, {}, env);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      `https://pr-296.recwatch.pages.dev/auth/callback?code=abc&state=${state}`
    );
    expect(await findAuthState(state)).toBeTruthy();
  });

  it('Microsoftのerror時も有効なstateのoriginを復元してcallbackへ中継する', async () => {
    const env = buildEnv({
      ALLOWED_ORIGINS: 'https://*.recwatch.pages.dev',
    });
    const state = 'state-preview-error';
    await putAuthState(state, {
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      frontend_origin: 'https://pr-296.recwatch.pages.dev',
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await app.request(
      `/callback?error=access_denied&state=${state}`,
      {},
      env
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      `https://pr-296.recwatch.pages.dev/auth/callback?error=access_denied&state=${state}`
    );
  });

  it('stateの未許可originはFRONTEND_URLへフォールバックする', async () => {
    const env = buildEnv({
      ALLOWED_ORIGINS: 'https://*.recwatch.pages.dev',
    });
    const state = 'state-untrusted-origin';
    await putAuthState(state, {
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      frontend_origin: 'https://evil.example',
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await app.request(`/callback?code=abc&state=${state}`, {}, env);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      `https://app.example.com/auth/callback?code=abc&state=${state}`
    );
  });

  it('期限切れのstateに保存したoriginは使わずFRONTEND_URLへ戻す', async () => {
    const env = buildEnv({
      ALLOWED_ORIGINS: 'https://*.recwatch.pages.dev',
    });
    const state = 'state-expired-origin';
    await putAuthState(state, {
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      frontend_origin: 'https://pr-296.recwatch.pages.dev',
      created_at: new Date().toISOString(),
    });
    await expireAuthState(state);

    const res = await buildApp().request(
      `/callback?code=abc&state=${state}`,
      {},
      env
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      `https://app.example.com/auth/callback?code=abc&state=${state}`
    );
  });
});

describe('POST /auth/microsoft/token', () => {
  describe.each(['token', 'delete-token'] as const)(
    '%sの上流障害',
    endpoint => {
      it.each([
        [503, { error: 'invalid_grant' }, 503, 'AUTH_PROVIDER_UNAVAILABLE'],
        [429, { error: 'invalid_grant' }, 503, 'AUTH_PROVIDER_UNAVAILABLE'],
        [400, { error: 'invalid_client' }, 500, 'AUTH_PROVIDER_ERROR'],
        [400, { error: 'invalid_grant' }, 401, 'TOKEN_EXCHANGE_FAILED'],
        [
          200,
          { access_token: 'access-without-id' },
          503,
          'AUTH_PROVIDER_UNAVAILABLE',
        ],
      ])(
        'HTTP %s / %jは%sを返しセッションを発行しない',
        async (status, payload, expectedStatus, code) => {
          const env = buildEnv();
          await putAuthState('provider-error', {
            code_verifier: generateRandom(32),
            nonce: 'nonce',
            client_type: 'web',
            purpose: endpoint === 'token' ? 'login' : 'account_deletion',
            created_at: new Date().toISOString(),
          });
          const fetchMock = vi
            .fn()
            .mockResolvedValue(
              new Response(JSON.stringify(payload), { status })
            );
          vi.stubGlobal('fetch', fetchMock);
          const res = await buildApp().request(
            `/${endpoint}`,
            {
              method: 'POST',
              headers: {
                'X-Client-Type': 'web',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ code: 'code', state: 'provider-error' }),
            },
            env
          );
          expect(res.status).toBe(expectedStatus);
          expect(await res.json()).toEqual({
            error: { code, message: expect.any(String) },
          });
          expect(await countRefreshSessions()).toBe(0);
          expect(fetchMock).toHaveBeenCalledTimes(1);
        }
      );
    }
  );

  it('不正なclient_typeの場合は400を返す', async () => {
    const app = buildApp();
    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'bogus',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      buildEnv()
    );
    expect(res.status).toBe(400);
  });

  it('code/stateが無い場合は400を返す', async () => {
    const app = buildApp();
    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      buildEnv()
    );
    expect(res.status).toBe(400);
  });

  it('mobileはcode_verifierが無い場合は400を返す', async () => {
    const app = buildApp();
    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'mobile',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'c', state: 's' }),
      },
      buildEnv()
    );
    expect(res.status).toBe(400);
  });

  it('存在しないstateの場合は401 STATE_MISMATCHを返す', async () => {
    const app = buildApp();
    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'c', state: 'unknown-state' }),
      },
      buildEnv()
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('STATE_MISMATCH');
  });

  it('期限切れのstateの場合は401 STATE_MISMATCHを返し、Microsoftへ問い合わせない', async () => {
    const env = buildEnv();
    await putAuthState('state-expired', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    await expireAuthState('state-expired');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await buildApp().request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'c', state: 'state-expired' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('STATE_MISMATCH');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stateのclient_typeとリクエストのclient_typeが異なる場合は400を返す', async () => {
    const env = buildEnv();
    await putAuthState('state-1', {
      nonce: 'n',
      client_type: 'mobile',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'c', state: 'state-1' }),
      },
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_STATE_CLIENT_TYPE');
  });

  it('webでpkceエントリにcode_verifierが保存されていない場合は401 CODE_VERIFIER_MISSINGを返す', async () => {
    const env = buildEnv();
    await putAuthState('state-1', {
      nonce: 'n',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'c', state: 'state-1' }),
      },
      env
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('CODE_VERIFIER_MISSING');
  });

  it('webは成功時、ボディにcode_verifierが無くてもサーバー保存済みのものを使って交換しaccess_token/refresh_token_idを返す', async () => {
    const env = buildEnv();

    // web token exchangeはstaff権限が無いと403になるため、既に
    // Microsoftアカウントと紐付いた既存staffユーザーとしてログインし直す
    // (2回目ログイン = updateUserの経路)ケースで検証する。
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('田中太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-1', 'tid-1')"
    )
      .bind(user!.user_id)
      .run();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-1',
      oid: 'oid-1',
      tid: 'tid-1',
      name: '田中太郎',
      preferred_username: 'tanaka@example.com',
      nonce: 'nonce-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    const fetchMock = stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token_id: string;
      token_type: string;
      user: { id: string; email: string };
    };
    expect(body.token_type).toBe('Bearer');
    expect(body.user.email).toBe('tanaka@example.com');

    // Microsoftとのトークン交換でも、/loginと同じ動的なredirect_uriが
    // 送信されていること(固定secretではなくリクエスト自身のオリジンから
    // 組み立てられる)を確認する。
    const tokenExchangeCall = fetchMock.mock.calls.find(([input]) =>
      (typeof input === 'string' ? input : input.toString()).includes(
        '/oauth2/v2.0/token'
      )
    );
    const sentBody = new URLSearchParams(
      tokenExchangeCall?.[1]?.body as string
    );
    expect(sentBody.get('redirect_uri')).toBe(
      'http://localhost/api/v1/auth/microsoft/callback'
    );

    const claims = await verifyAccessToken(
      body.access_token,
      JWT_SECRET,
      'web'
    );
    expect(claims.client_type).toBe('web');
    expect(claims.sub).toBe(body.user.id);

    const session = await findRefreshSession(body.refresh_token_id);
    expect(session?.ms_refresh_token).toBe('ms-refresh-token');
    expect(session?.client_type).toBe('web');

    // stateは使い切りで再利用できない
    expect(await findAuthState('state-1')).toBeNull();
  });

  it('purposeがaccount_deletion(/delete-loginで発行されたstate)の場合は400 INVALID_STATE_PURPOSEを返す', async () => {
    // /delete-token側のクロスユース拒否(purposeがloginの場合)は別途
    // テスト済み。逆方向として、削除確認フロー用に発行されたstateが
    // 通常ログインの/tokenに渡された場合も拒否されることを確認する。
    const env = buildEnv();
    await putAuthState('state-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'account_deletion',
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_STATE_PURPOSE');
  });

  it('mobileは成功時、ボディのcode_verifierを使って交換しaccess_token/refresh_token_idを返す(staff権限は不要)', async () => {
    const env = buildEnv();
    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-2',
      oid: 'oid-2',
      tid: 'tid-1',
      name: '山田花子',
      preferred_username: 'yamada@example.com',
      nonce: 'nonce-2',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-2', {
      nonce: 'nonce-2',
      client_type: 'mobile',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'mobile',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'auth-code-2',
          state: 'state-2',
          code_verifier: generateRandom(32),
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token_id: string;
    };

    const claims = await verifyAccessToken(
      body.access_token,
      JWT_SECRET,
      'mobile'
    );
    expect(claims.client_type).toBe('mobile');

    const session = await findRefreshSession(body.refresh_token_id);
    expect(session?.client_type).toBe('mobile');
  });

  it('Microsoftとのトークン交換に失敗した場合は401を返す', async () => {
    const env = buildEnv();
    await putAuthState('state-3', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-3',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
        })
      )
    );
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'bad-code', state: 'state-3' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('TOKEN_EXCHANGE_FAILED');
  });

  it('学籍番号紐付け時にuser_idが既に別のMicrosoftアカウントと紐付いている場合、409 STUDENT_ALREADY_LINKEDを返す', async () => {
    const env = buildEnv();

    const classRoom = await insertClassRoomWithTeam(workerEnv.DB, {
      classCode: '3A',
      className: '3年A組',
    });

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('田中太郎') RETURNING user_id"
    ).first<{ user_id: number }>();

    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '50000')"
    )
      .bind(user!.user_id, classRoom.classRoomId)
      .run();

    // この学生のuser_idに、既に別のMicrosoftアカウントが紐付いている状態を作る
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-other', 'tid-other')"
    )
      .bind(user!.user_id)
      .run();

    // 別のMicrosoftアカウントで、同じ学籍番号のメールアドレスでログインを試みる
    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-1',
      oid: 'oid-1',
      tid: 'tid-1',
      name: 'なりすまし太郎',
      preferred_username: 'nhs50000@nhs.hal.ac.jp',
      nonce: 'nonce-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('STUDENT_ALREADY_LINKED');
  });

  it('deletion_statusがdeletion_pendingの既存ユーザーがログインを試みると410 ACCOUNT_DELETION_PENDINGを返す', async () => {
    const env = buildEnv();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('田中太郎', 'deletion_pending') RETURNING user_id"
    ).first<{ user_id: number }>();

    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-1', 'tid-1')"
    )
      .bind(user!.user_id)
      .run();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-1',
      oid: 'oid-1',
      tid: 'tid-1',
      name: '田中太郎',
      preferred_username: 'tanaka@example.com',
      nonce: 'nonce-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_DELETION_PENDING');
  });

  it('student + staffユーザーが初回ログイン時、既存Studentのuser_idでstaff判定されstudent_id_number/class_room_nameを返す', async () => {
    const env = buildEnv();

    const classRoom = await insertClassRoomWithTeam(workerEnv.DB, {
      classCode: '3B',
      className: '3年B組',
    });
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生次郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 2, '60001')"
    )
      .bind(user!.user_id, classRoom.classRoomId)
      .run();
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-student-1',
      oid: 'oid-student-1',
      tid: 'tid-1',
      name: '学生次郎',
      preferred_username: 'nhs60001@nhs.hal.ac.jp',
      nonce: 'nonce-student-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-student-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-student-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-student-1',
          state: 'state-student-1',
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: {
        id: string;
        student_id_number: string | null;
        class_code: string | null;
        class_room_name: string | null;
        class_room_id: number | null;
        team_id: number | null;
        attendance_number: number | null;
      };
    };
    expect(body.user.id).toBe(String(user!.user_id));
    expect(body.user.student_id_number).toBe('60001');
    expect(body.user.class_code).toBe('3B');
    expect(body.user.class_room_name).toBe('3年B組');
    expect(body.user.class_room_id).toBe(classRoom.classRoomId);
    expect(body.user.team_id).toBe(classRoom.teamId);
    expect(body.user.attendance_number).toBe(2);
  });

  it('生徒情報取得に失敗した場合、Refresh Sessionを保存せずエラーにする', async () => {
    const env = buildEnv();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('教師三郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-student-lookup-failure', 'tid-1')"
    )
      .bind(user!.user_id)
      .run();
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-student-lookup-failure',
      oid: 'oid-student-lookup-failure',
      tid: 'tid-1',
      name: '教師三郎',
      preferred_username: 'sensei-lookup-failure@example.com',
      nonce: 'nonce-student-lookup-failure',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-student-lookup-failure', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-student-lookup-failure',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildAppWithFailingStudentLookup();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-student-lookup-failure',
          state: 'state-student-lookup-failure',
        }),
      },
      env
    );

    expect(res.status).toBe(500);
    expect(await countRefreshSessions()).toBe(0);
  });

  it('事前登録済み教員はmobile初回ログインとwebログインで同じuser_id・担当クラスを維持する', async () => {
    const env = buildEnv();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('教師三郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    const teacher = await workerEnv.DB.prepare(
      "INSERT INTO teachers (user_id, email) VALUES (?, 'sensei@example.com') RETURNING teacher_id"
    )
      .bind(user!.user_id)
      .first<{ teacher_id: number }>();
    // Webログインのstaff必須化(#288)の導入後もこの回帰テストが
    // 本来の「教員のuser_id紐付け」を検証し続けられるよう、同じuserを
    // teacher + staffとして事前登録する。
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();
    const classRoom = await insertClassRoomWithTeam(workerEnv.DB, {
      classCode: 'TEACHER-LINK',
      className: '教員紐付け確認',
      teacherId: teacher!.teacher_id,
    });

    const firstResponse = await requestMobileLogin(env, {
      attemptId: 'teacher-link-1',
      oid: 'oid-teacher-link',
      sub: 'sub-teacher-link',
      name: 'NH-STAFF Microsoft表示名',
      email: 'sensei@example.com',
    });

    expect(firstResponse.status).toBe(200);
    const firstBody = (await firstResponse.json()) as {
      access_token: string;
      user: { id: string; is_staff: boolean; is_teacher: boolean };
    };
    expect(firstBody.user.id).toBe(String(user!.user_id));
    expect(firstBody.user.is_staff).toBe(true);
    expect(firstBody.user.is_teacher).toBe(true);
    const expectedTeacher = {
      teacher_id: teacher!.teacher_id,
      class_rooms: [
        {
          class_room_id: classRoom!.classRoomId,
          class_code: 'TEACHER-LINK',
          class_room_name: '教員紐付け確認',
        },
      ],
    };
    expect(firstBody.user).toMatchObject({ teacher: expectedTeacher });
    const accountApp = new Hono<{ Bindings: Env }>();
    accountApp.use('*', diContainerMiddleware);
    accountApp.route('/', account);
    const meResponse = await accountApp.request(
      '/me',
      {
        headers: {
          Authorization: `Bearer ${firstBody.access_token}`,
          'X-Client-Type': 'mobile',
        },
      },
      env
    );
    expect(meResponse.status).toBe(200);
    expect(await meResponse.json()).toEqual({ user: firstBody.user });

    const usersAfterFirstLogin = await workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM users'
    ).first<{ count: number }>();
    expect(usersAfterFirstLogin?.count).toBe(1);

    const link = await workerEnv.DB.prepare(
      'SELECT user_id, oid, tid FROM microsoft_account_links WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ user_id: number; oid: string; tid: string }>();
    expect(link).toEqual({
      user_id: user!.user_id,
      oid: 'oid-teacher-link',
      tid: 'tid-1',
    });

    const assignedClassRoom = await workerEnv.DB.prepare(
      'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
    )
      .bind(classRoom.classRoomId)
      .first<{ teacher_id: number | null }>();
    expect(assignedClassRoom?.teacher_id).toBe(teacher!.teacher_id);

    const secondResponse = await requestWebLogin(env, {
      attemptId: 'teacher-link-2',
      oid: 'oid-teacher-link',
      sub: 'sub-teacher-link',
      name: 'NH-STAFF Microsoft表示名',
      email: 'sensei@example.com',
    });

    expect(secondResponse.status).toBe(200);
    const secondBody = (await secondResponse.json()) as {
      user: { id: string; is_staff: boolean; is_teacher: boolean };
    };
    expect(secondBody.user.id).toBe(String(user!.user_id));
    expect(secondBody.user.is_staff).toBe(true);
    expect(secondBody.user.is_teacher).toBe(true);
    expect(secondBody.user).toMatchObject({ teacher: expectedTeacher });

    const usersAfterSecondLogin = await workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM users'
    ).first<{ count: number }>();
    expect(usersAfterSecondLogin?.count).toBe(1);

    const linksAfterSecondLogin = await workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM microsoft_account_links'
    ).first<{ count: number }>();
    expect(linksAfterSecondLogin?.count).toBe(1);

    const classRoomAfterSecondLogin = await workerEnv.DB.prepare(
      'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
    )
      .bind(classRoom.classRoomId)
      .first<{ teacher_id: number | null }>();
    expect(classRoomAfterSecondLogin?.teacher_id).toBe(teacher!.teacher_id);
  });

  it('同名の教員が複数いてもメールが一致する教員だけへ紐付ける', async () => {
    const env = buildEnv();

    const firstUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('同名先生') RETURNING user_id"
    ).first<{ user_id: number }>();
    const secondUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('同名先生') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO teachers (user_id, email) VALUES (?, 'first.teacher@example.com')"
    )
      .bind(firstUser!.user_id)
      .run();
    await workerEnv.DB.prepare(
      "INSERT INTO teachers (user_id, email) VALUES (?, 'second.teacher@example.com')"
    )
      .bind(secondUser!.user_id)
      .run();
    // Webログインのstaff必須化(#288)の導入後もこの回帰テストが
    // 本来の「メール一致による教員紐付け」を検証し続けられるよう、
    // 一致させたい側のuserをteacher + staffとして事前登録する。
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(secondUser!.user_id)
      .run();

    const response = await requestWebLogin(env, {
      attemptId: 'teacher-same-name',
      oid: 'oid-teacher-same-name',
      sub: 'sub-teacher-same-name',
      name: 'NH-STAFF 同名先生',
      email: 'second.teacher@example.com',
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string } };
    expect(body.user.id).toBe(String(secondUser!.user_id));

    const userCount = await workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM users'
    ).first<{ count: number }>();
    const links = await workerEnv.DB.prepare(
      'SELECT user_id, oid FROM microsoft_account_links'
    ).all<{ user_id: number; oid: string }>();
    expect(userCount?.count).toBe(2);
    expect(links.results).toEqual([
      {
        user_id: secondUser!.user_id,
        oid: 'oid-teacher-same-name',
      },
    ]);
  });

  it('同名の事前登録済み教員が別のMicrosoftアカウントと連携済みの場合は409 TEACHER_ALREADY_LINKEDを返す', async () => {
    const env = buildEnv();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('連携済み先生') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO teachers (user_id, email) VALUES (?, 'linked@example.com')"
    )
      .bind(user!.user_id)
      .run();
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-existing-teacher', 'tid-1')"
    )
      .bind(user!.user_id)
      .run();

    const response = await requestWebLogin(env, {
      attemptId: 'teacher-already-linked',
      oid: 'oid-new-teacher',
      sub: 'sub-new-teacher',
      name: '連携済み先生',
      email: 'linked@example.com',
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('TEACHER_ALREADY_LINKED');

    const userCount = await workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM users'
    ).first<{ count: number }>();
    const links = await workerEnv.DB.prepare(
      'SELECT user_id, oid, tid FROM microsoft_account_links'
    ).all<{ user_id: number; oid: string; tid: string }>();
    expect(userCount?.count).toBe(1);
    expect(links.results).toEqual([
      {
        user_id: user!.user_id,
        oid: 'oid-existing-teacher',
        tid: 'tid-1',
      },
    ]);
  });

  it('無効化された事前登録済み教員は401 USER_DEACTIVATEDとなり、新規ユーザーもリンクも作らない', async () => {
    const env = buildEnv();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, is_live_active) VALUES ('無効化教員', 0) RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO teachers (user_id, email) VALUES (?, 'deactivated@example.com')"
    )
      .bind(user!.user_id)
      .run();

    const response = await requestWebLogin(env, {
      attemptId: 'teacher-deactivated',
      oid: 'oid-teacher-deactivated',
      sub: 'sub-teacher-deactivated',
      name: '無効化教員',
      email: 'deactivated@example.com',
    });

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('USER_DEACTIVATED');

    const userCount = await workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM users'
    ).first<{ count: number }>();
    const linkCount = await workerEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM microsoft_account_links'
    ).first<{ count: number }>();
    expect(userCount?.count).toBe(1);
    expect(linkCount?.count).toBe(0);
  });

  it('studentのみ(staffではない)ユーザーはWebログインできない', async () => {
    const env = buildEnv();

    const classRoom = await insertClassRoomWithTeam(workerEnv.DB, {
      classCode: '3E',
      className: '3年E組',
    });
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生三郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 3, '60002')"
    )
      .bind(user!.user_id, classRoom.classRoomId)
      .run();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-student-2',
      oid: 'oid-student-2',
      tid: 'tid-1',
      name: '学生三郎',
      preferred_username: 'nhs60002@nhs.hal.ac.jp',
      nonce: 'nonce-student-2',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-student-2', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-student-2',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-student-2',
          state: 'state-student-2',
        }),
      },
      env
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('STAFF_REQUIRED');
  });

  it('staffではない新規ユーザーはWebログインできない', async () => {
    const env = buildEnv();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-teacher-1',
      oid: 'oid-teacher-1',
      tid: 'tid-1',
      name: '教師三郎',
      preferred_username: 'sensei@example.com',
      nonce: 'nonce-teacher-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-teacher-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-teacher-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-teacher-1',
          state: 'state-teacher-1',
        }),
      },
      env
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('STAFF_REQUIRED');
  });

  it('teacherのみ(staffではない)ユーザーはWebログインできない', async () => {
    const env = buildEnv();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('教員花子') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO teachers (user_id, email) VALUES (?, 'hanako@example.com')"
    )
      .bind(user!.user_id)
      .run();
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-teacher-2', 'tid-1')"
    )
      .bind(user!.user_id)
      .run();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-teacher-2',
      oid: 'oid-teacher-2',
      tid: 'tid-1',
      name: '教員花子',
      preferred_username: 'hanako@example.com',
      nonce: 'nonce-teacher-2',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-teacher-2', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-teacher-2',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-teacher-2',
          state: 'state-teacher-2',
        }),
      },
      env
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('STAFF_REQUIRED');
  });

  it('staff判定でエラーが発生した場合は500 INTERNAL_SERVER_ERRORを返す', async () => {
    const env = buildEnv();
    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-staff-error-1',
      oid: 'oid-staff-error-1',
      tid: 'tid-1',
      name: 'エラー太郎',
      preferred_username: 'error@example.com',
      nonce: 'nonce-staff-error-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-staff-error-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-staff-error-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);

    // buildApp()はroute登録が先に固まってしまい、後から追加した
    // モック用ミドルウェアがハンドラより後に評価されて効かないため、
    // ここではdiContainerMiddleware→モック→routeの順で自前に組み立てる。
    const app = new Hono<{ Bindings: Env }>();
    app.use('*', diContainerMiddleware);
    app.use(
      '*',
      async (
        c: Context<{ Bindings: Env; Variables: ContainerVariables }>,
        next
      ) => {
        c.get('container').authorizationService.isStaff = vi
          .fn()
          .mockRejectedValue(new Error('D1 error'));
        await next();
      }
    );
    app.route('/', microsoft);

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-staff-error-1',
          state: 'state-staff-error-1',
        }),
      },
      env
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('markAsDeleted実行後に同じ学籍番号メールでログインすると、古い削除済みユーザーへ紐付けず新規アカウントとして登録される', async () => {
    // ここで検証したい再登録の挙動(削除済みuser_idへ紐付けず新規発行
    // される)はclient_typeに依存しない。Webは新規ユーザーにstaff権限が
    // 必須(#288)で新規登録の検証に使えないため、mobileで検証する。
    const env = buildEnv();

    const classRoom = await insertClassRoomWithTeam(workerEnv.DB, {
      classCode: '3C',
      className: '3年C組',
    });
    const oldUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生太郎(削除前)') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 3, '70001')"
    )
      .bind(oldUser!.user_id, classRoom.classRoomId)
      .run();
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-deleted-student-1', 'tid-1')"
    )
      .bind(oldUser!.user_id)
      .run();

    // 本人によるアカウント削除が完了した状態を再現する
    // (deletion_status: deleted かつ microsoft_account_links 削除済み)。
    const userRepository = createUserRepository(env.DB);
    await userRepository.markAsDeleted(String(oldUser!.user_id));

    // 同じ学籍番号(=同じ学生メール)で、別のMicrosoftアカウントとして
    // 再登録を試みる想定(削除後に発行し直されたMicrosoftアカウント等)。
    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-deleted-student-2',
      oid: 'oid-deleted-student-2',
      tid: 'tid-1',
      name: '学生太郎(再登録)',
      preferred_username: 'nhs70001@nhs.hal.ac.jp',
      nonce: 'nonce-deleted-student-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-deleted-student-1', {
      nonce: 'nonce-deleted-student-1',
      client_type: 'mobile',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'mobile',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'auth-code-deleted-student-1',
          state: 'state-deleted-student-1',
          code_verifier: generateRandom(32),
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    // 古い(削除済みの)user_idへ紐付けられていない(=新規のuser_idが発行された)
    expect(body.user.id).not.toBe(String(oldUser!.user_id));

    const oldUserRow = await workerEnv.DB.prepare(
      'SELECT deletion_status FROM users WHERE user_id = ?'
    )
      .bind(oldUser!.user_id)
      .first<{ deletion_status: string }>();
    expect(oldUserRow?.deletion_status).toBe('deleted');
  });

  it('deletion_pendingの学生が学籍番号ログインを試みると410 ACCOUNT_DELETION_PENDINGを返す', async () => {
    const env = buildEnv();

    const classRoom = await insertClassRoomWithTeam(workerEnv.DB, {
      classCode: '3D',
      className: '3年D組',
    });
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('学生太郎(削除処理中)', 'deletion_pending') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 4, '70002')"
    )
      .bind(user!.user_id, classRoom.classRoomId)
      .run();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-pending-student-1',
      oid: 'oid-pending-student-1',
      tid: 'tid-1',
      name: '学生太郎',
      preferred_username: 'nhs70002@nhs.hal.ac.jp',
      nonce: 'nonce-pending-student-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-pending-student-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-pending-student-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-pending-student-1',
          state: 'state-pending-student-1',
        }),
      },
      env
    );

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_DELETION_PENDING');

    const linkRow = await workerEnv.DB.prepare(
      'SELECT * FROM microsoft_account_links WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(linkRow).toBeNull();
  });
});

describe('GET /auth/microsoft/delete-login', () => {
  it('webはMicrosoftへ302リダイレクトし、stateをpurpose: account_deletionで保存する', async () => {
    const env = buildEnv();
    const app = buildApp();

    const res = await app.request('/delete-login', {}, env);

    expect(res.status).toBe(302);
    const location = res.headers.get('Location') ?? '';
    expect(location).toContain('login.microsoftonline.com');
    // 削除確認フローはprompt=loginで資格情報の再入力を強制する。
    // Microsoft側にセッションが残っていても、prompt=select_accountのままだと
    // 無入力で認証が完了し得るため、「今操作している本人」の再認証にならない。
    expect(new URL(location).searchParams.get('prompt')).toBe('login');

    const state = new URL(location).searchParams.get('state') as string;
    const stored = (await findAuthState(state)) as PkceEntry;
    expect(stored.client_type).toBe('web');
    expect(stored.purpose).toBe('account_deletion');
    expect(stored.code_verifier).toBeTruthy();
  });

  it('delete-loginは許可済みRefererのoriginをPKCE stateに保存する', async () => {
    const env = buildEnv({
      ALLOWED_ORIGINS: 'https://*.recwatch.pages.dev',
    });
    const app = buildApp();

    const res = await app.request(
      '/delete-login',
      {
        headers: {
          Referer: 'https://pr-296.recwatch.pages.dev/delete-account',
        },
      },
      env
    );

    expect(res.status).toBe(302);
    const state = new URL(res.headers.get('Location') ?? '').searchParams.get(
      'state'
    ) as string;
    const stored = (await findAuthState(state)) as PkceEntry;
    expect(stored.frontend_origin).toBe('https://pr-296.recwatch.pages.dev');
  });
  it('mobileは有効なパラメータでauth_urlを返しstateをpurpose: account_deletionで保存し、prompt=loginを含むauth_urlを返す', async () => {
    const env = buildEnv();
    const state = generateRandom(32);
    const codeChallenge = generateRandom(32);
    const app = buildApp();

    const res = await app.request(
      '/delete-login',
      {
        headers: {
          'X-Client-Type': 'mobile',
          'X-State': state,
          'X-PKCE-Code-Challenge': codeChallenge,
        },
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { auth_url: string };
    expect(new URL(body.auth_url).searchParams.get('prompt')).toBe('login');

    const stored = (await findAuthState(state)) as PkceEntry;
    expect(stored.client_type).toBe('mobile');
    expect(stored.purpose).toBe('account_deletion');
  });
});

describe('POST /auth/microsoft/delete-token', () => {
  it('purposeがlogin(通常/loginで発行されたstate)の場合は400 INVALID_STATE_PURPOSEを返す', async () => {
    const env = buildEnv();
    await putAuthState('state-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'login',
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await app.request(
      '/delete-token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_STATE_PURPOSE');
  });

  it('対応するアカウントが存在しない場合は404 ACCOUNT_NOT_FOUNDを返し、upsertUserで新規作成しない', async () => {
    const env = buildEnv();
    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-1',
      oid: 'oid-unknown',
      tid: 'tid-1',
      name: '田中太郎',
      preferred_username: 'tanaka@example.com',
      nonce: 'nonce-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'account_deletion',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/delete-token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_NOT_FOUND');

    const usersCount = await workerEnv.DB.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first<{ count: number }>();
    expect(usersCount?.count).toBe(0);
  });

  it('既存アカウントが見つかる場合は削除確認Tokenを発行し、一般API用access_tokenは返さない', async () => {
    const env = buildEnv();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('田中太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-1', 'tid-1')"
    )
      .bind(user!.user_id)
      .run();

    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-1',
      oid: 'oid-1',
      tid: 'tid-1',
      name: '田中太郎',
      preferred_username: 'tanaka@example.com',
      nonce: 'nonce-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await putAuthState('state-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'account_deletion',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/delete-token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deletion_confirmation_token: string;
      expires_in: number;
      access_token?: string;
    };
    expect(body.deletion_confirmation_token).toBeTruthy();
    expect(body.access_token).toBeUndefined();

    const stored = JSON.parse(
      (await env.AUTH_KV.get(
        `deletion_confirmation:${body.deletion_confirmation_token}`
      )) as string
    ) as DeletionConfirmationEntry;
    expect(stored.user_id).toBe(String(user!.user_id));

    expect(await countRefreshSessions()).toBe(0);
  });

  it('stateは一度使うと削除され、同じstateでの再利用はできない', async () => {
    const env = buildEnv();
    await putAuthState('state-1', {
      code_verifier: generateRandom(32),
      nonce: 'nonce-1',
      client_type: 'web',
      purpose: 'account_deletion',
      created_at: new Date().toISOString(),
    });
    stubMicrosoftFetch(
      await signIdToken({
        sub: 'sub-1',
        oid: 'oid-1',
        tid: 'tid-1',
        nonce: 'nonce-1',
        iss: `https://login.microsoftonline.com/tid-1/v2.0`,
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000) - 10,
      })
    );
    const app = buildApp();

    await app.request(
      '/delete-token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    const res = await app.request(
      '/delete-token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'auth-code-1', state: 'state-1' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('STATE_MISMATCH');
  });
});

describe('Desktopのループバック認証', () => {
  for (const endpoint of ['/login', '/delete-login']) {
    it(`${endpoint}はDesktopの戻り先を検証してstateに保存する`, async () => {
      const env = buildEnv();
      const state = generateRandom(32);
      const redirectUri = 'http://localhost:54321/auth/callback';
      const response = await buildApp().request(
        endpoint,
        {
          headers: {
            'X-Client-Type': 'mobile',
            'X-State': state,
            'X-PKCE-Code-Challenge': generateRandom(32),
            'X-Desktop-Redirect-Uri': redirectUri,
          },
        },
        env
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { auth_url: string };
      expect(new URL(body.auth_url).searchParams.get('redirect_uri')).toBe(
        redirectUri
      );
      const stored = (await findAuthState(state)) as PkceEntry;
      expect(stored.desktop_redirect_uri).toBe(redirectUri);
    });

    it.each([
      'https://localhost:54321/auth/callback',
      'http://example.com:54321/auth/callback',
      'http://localhost.example.com:54321/auth/callback',
      'http://127.0.0.1:54321/auth/callback',
      'http://localhost/auth/callback',
      'http://localhost:80/auth/callback',
      'http://localhost:54321/api/v1/auth/microsoft/callback',
      'http://localhost:54321/auth/callback?extra=1',
      'http://localhost:54321/auth/callback#fragment',
      'http://user@localhost:54321/auth/callback',
      'http://localhost:54321/auth/../auth/callback',
    ])(`${endpoint}は不正な戻り先 %s を拒否する`, async redirectUri => {
      const env = buildEnv();
      const state = generateRandom(32);
      const response = await buildApp().request(
        endpoint,
        {
          headers: {
            'X-Client-Type': 'mobile',
            'X-State': state,
            'X-PKCE-Code-Challenge': generateRandom(32),
            'X-Desktop-Redirect-Uri': redirectUri,
          },
        },
        env
      );
      expect(response.status).toBe(400);
      expect(await findAuthState(state)).toBeNull();
    });
  }

  it('WebではDesktopのヘッダーを拒否する', async () => {
    const response = await buildApp().request(
      '/login',
      {
        headers: {
          'X-Client-Type': 'web',
          'X-Desktop-Redirect-Uri': 'http://localhost:54321/auth/callback',
        },
      },
      buildEnv()
    );
    expect(response.status).toBe(400);
  });

  for (const [start, exchange] of [
    ['/login', '/token'],
    ['/delete-login', '/delete-token'],
  ]) {
    it(`${exchange}は開始時の戻り先とPKCEを使い、交換時のヘッダーでは変更しない`, async () => {
      const env = buildEnv();
      const state = generateRandom(32);
      const verifier = generateRandom(32);
      const redirectUri = 'http://localhost:54321/auth/callback';
      await buildApp().request(
        start,
        {
          headers: {
            'X-Client-Type': 'mobile',
            'X-State': state,
            'X-PKCE-Code-Challenge': generateRandom(32),
            'X-Desktop-Redirect-Uri': redirectUri,
          },
        },
        env
      );
      let sent: URLSearchParams | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          sent = new URLSearchParams(init.body as string);
          return new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
          });
        })
      );
      await buildApp().request(
        exchange,
        {
          method: 'POST',
          headers: {
            'X-Client-Type': 'mobile',
            'Content-Type': 'application/json',
            'X-Desktop-Redirect-Uri': 'http://localhost:54322/auth/callback',
          },
          body: JSON.stringify({
            code: 'test-code',
            state,
            code_verifier: verifier,
          }),
        },
        env
      );
      expect(sent?.get('redirect_uri')).toBe(redirectUri);
      expect(sent?.get('code_verifier')).toBe(verifier);
      expect(sent?.has('client_assertion')).toBe(false);
      expect(await findAuthState(state)).toBeNull();
    });
  }
});

describe('ログインでのKVの書き込み', () => {
  it('mobileとwebのログイン開始ではKVに書き込まない', async () => {
    const env = buildEnv();

    const mobile = await buildApp().request(
      '/login',
      {
        headers: {
          'X-Client-Type': 'mobile',
          'X-State': generateRandom(32),
          'X-PKCE-Code-Challenge': generateRandom(32),
        },
      },
      env
    );
    const web = await buildApp().request(
      '/login',
      { headers: { 'X-Client-Type': 'web' } },
      env
    );

    expect(mobile.status).toBe(200);
    expect(web.status).toBe(302);
    expect(env.AUTH_KV.put).not.toHaveBeenCalled();
    expect(env.AUTH_KV.delete).not.toHaveBeenCalled();
  });

  it('トークン発行ではKVにJWKSのキャッシュ以外を書き込まない', async () => {
    const env = buildEnv();

    const res = await requestMobileLogin(env, {
      attemptId: 'kv-writes',
      oid: 'oid-kv-writes',
      sub: 'sub-kv-writes',
      name: '山田花子',
      email: 'yamada@example.com',
    });

    expect(res.status).toBe(200);
    const writtenKeys = vi
      .mocked(env.AUTH_KV.put)
      .mock.calls.map(([key]) => key);
    expect(writtenKeys.every(key => key === 'jwks_cache')).toBe(true);
    expect(env.AUTH_KV.delete).not.toHaveBeenCalled();
  });
});
