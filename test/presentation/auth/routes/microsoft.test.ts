import { env as workerEnv } from 'cloudflare:workers';
import { Hono } from 'hono';
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
import { verifyAccessToken } from '../../../../src/infrastructure/auth/jwt';
import { generateRandom } from '../../../../src/infrastructure/auth/pkce';
import { toBase64URL } from '../../../../src/infrastructure/auth/base64url';
import type { Env } from '../../../../src/lib/env';
import type {
  PkceEntry,
  MobileRefreshEntry,
  DeletionConfirmationEntry,
} from '../../../../src/domain/auth/types';
import { diContainerMiddleware } from '../../../../src/presentation/middleware/diContainer';
import { createUserRepository } from '../../../../src/infrastructure/repositories/UserRepository';

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
  await workerEnv.DB.prepare('DELETE FROM gathering_group_members').run();
  await workerEnv.DB.prepare('DELETE FROM notification_schedules').run();
  await workerEnv.DB.prepare('DELETE FROM gatherings').run();
  await workerEnv.DB.prepare('DELETE FROM events').run();
  await workerEnv.DB.prepare('DELETE FROM microsoft_account_links').run();
  await workerEnv.DB.prepare('DELETE FROM staffs').run();
  await workerEnv.DB.prepare('DELETE FROM teachers').run();
  await workerEnv.DB.prepare('DELETE FROM students').run();
  await workerEnv.DB.prepare('DELETE FROM users').run();
});

function buildEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: workerEnv.DB,
    AUTH_KV: createMockKv(),
    MASTER_IMPORT_COMMIT_LOCK: {} as Env['MASTER_IMPORT_COMMIT_LOCK'],
    NOTIFICATION_DELIVERY_QUEUE: {} as Env['NOTIFICATION_DELIVERY_QUEUE'],
    ALLOWED_ORIGINS: '',
    FIREBASE_PROJECT_ID: 'project',
    FIREBASE_CLIENT_EMAIL: 'sa@example.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: 'dummy-key',
    TEST_FCM_TOKEN: 'test-token',
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

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', diContainerMiddleware);
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
    await env.AUTH_KV.put(`pkce:${state}`, JSON.stringify({ nonce: 'n' }));
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

  it('mobileは有効なパラメータでauth_urlを返しKVにclient_type: mobileで保存する', async () => {
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

    const stored = JSON.parse(
      (await env.AUTH_KV.get(`pkce:${state}`)) as string
    ) as PkceEntry;
    expect(stored.client_type).toBe('mobile');
    expect(stored.code_verifier).toBeUndefined();
  });

  it('webはMicrosoftへ302リダイレクトし、KVにcode_verifier付きでclient_type: webを保存する', async () => {
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
    const stored = JSON.parse(
      (await env.AUTH_KV.get(`pkce:${state}`)) as string
    ) as PkceEntry;
    expect(stored.client_type).toBe('web');
    expect(stored.code_verifier).toBeTruthy();
  });
});

describe('GET /auth/microsoft/callback', () => {
  it('errorクエリがある場合はログイン画面へリダイレクトする', async () => {
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
});

describe('POST /auth/microsoft/token', () => {
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

  it('stateのclient_typeとリクエストのclient_typeが異なる場合は400を返す', async () => {
    const env = buildEnv();
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        nonce: 'n',
        client_type: 'mobile',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        nonce: 'n',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-1',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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

    const refreshRaw = await env.AUTH_KV.get(
      `mobile_refresh:${body.refresh_token_id}`
    );
    expect(refreshRaw).toBeTruthy();
    const refreshEntry = JSON.parse(refreshRaw as string) as MobileRefreshEntry;
    expect(refreshEntry.ms_refresh_token).toBe('ms-refresh-token');
    expect(refreshEntry.client_type).toBe('web');

    // stateは使い切りで再利用できない
    expect(await env.AUTH_KV.get('pkce:state-1')).toBeNull();
  });

  it('purposeフィールドを含まない(purpose導入前に保存された)stateでも通常ログインとして成功する', async () => {
    // API更新の直前にMicrosoftログイン画面を開いた利用者が、認証中に
    // デプロイをまたいで戻ってきた場合を再現する。KV上のPkceEntryには
    // purposeフィールドが存在しない(JSON.stringifyでpurposeキー自体が
    // 無い状態)。この場合を新コードのpurposeチェックがINVALID_STATE_
    // PURPOSEとして拒否してしまうと、正当な通常ログインができなくなる。
    const env = buildEnv();
    const now = Math.floor(Date.now() / 1000);
    const idToken = await signIdToken({
      sub: 'sub-legacy-1',
      oid: 'oid-legacy-1',
      tid: 'tid-1',
      name: '田中太郎',
      preferred_username: 'tanaka@example.com',
      nonce: 'nonce-legacy-1',
      iss: `https://login.microsoftonline.com/tid-1/v2.0`,
      aud: CLIENT_ID,
      exp: now + 3600,
      iat: now - 10,
    });
    await env.AUTH_KV.put(
      'pkce:state-legacy-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-legacy-1',
        client_type: 'web',
        created_at: new Date().toISOString(),
        // purposeを意図的に含めない(デプロイ境界をまたいだ場合の再現)
      })
    );
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-legacy-1',
          state: 'state-legacy-1',
        }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string };
    expect(body.access_token).toBeTruthy();
  });

  it('purposeがaccount_deletion(/delete-loginで発行されたstate)の場合は400 INVALID_STATE_PURPOSEを返す', async () => {
    // /delete-token側のクロスユース拒否(purposeがloginの場合)は別途
    // テスト済み。逆方向として、削除確認フロー用に発行されたstateが
    // 通常ログインの/tokenに渡された場合も拒否されることを確認する。
    const env = buildEnv();
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-1',
        client_type: 'web',
        purpose: 'account_deletion',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
    await env.AUTH_KV.put(
      'pkce:state-2',
      JSON.stringify({
        nonce: 'nonce-2',
        client_type: 'mobile',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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

    const refreshRaw = await env.AUTH_KV.get(
      `mobile_refresh:${body.refresh_token_id}`
    );
    const refreshEntry = JSON.parse(refreshRaw as string) as MobileRefreshEntry;
    expect(refreshEntry.client_type).toBe('mobile');
  });

  it('Microsoftとのトークン交換に失敗した場合は401を返す', async () => {
    const env = buildEnv();
    await env.AUTH_KV.put(
      'pkce:state-3',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-3',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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

    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('3A', '3年A組') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('田中太郎') RETURNING user_id"
    ).first<{ user_id: number }>();

    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '50000')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
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
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-1',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-1',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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

    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('3B', '3年B組') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生次郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 2, '60001')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
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
    await env.AUTH_KV.put(
      'pkce:state-student-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-student-1',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
        class_room_name: string | null;
      };
    };
    expect(body.user.id).toBe(String(user!.user_id));
    expect(body.user.student_id_number).toBe('60001');
    expect(body.user.class_room_name).toBe('3年B組');
  });

  it('studentのみ(staffではない)ユーザーはWebログインできない', async () => {
    const env = buildEnv();

    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('3C', '3年C組') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生三郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 3, '60002')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
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
    await env.AUTH_KV.put(
      'pkce:state-student-2',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-student-2',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
    await env.AUTH_KV.put(
      'pkce:state-teacher-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-teacher-1',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
    await workerEnv.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
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
    await env.AUTH_KV.put(
      'pkce:state-teacher-2',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-teacher-2',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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

  it('markAsDeleted実行後に同じ学籍番号メールでログインすると、古い削除済みユーザーへ紐付けず新規アカウントとして登録される', async () => {
    const env = buildEnv();

    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('3C', '3年C組') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const oldUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生太郎(削除前)') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 3, '70001')"
    )
      .bind(oldUser!.user_id, classRoom!.class_room_id)
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
    await env.AUTH_KV.put(
      'pkce:state-deleted-student-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-deleted-student-1',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
    stubMicrosoftFetch(idToken);
    const app = buildApp();

    const res = await app.request(
      '/token',
      {
        method: 'POST',
        headers: { 'X-Client-Type': 'web', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'auth-code-deleted-student-1',
          state: 'state-deleted-student-1',
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

    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('3D', '3年D組') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('学生太郎(削除処理中)', 'deletion_pending') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 4, '70002')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
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
    await env.AUTH_KV.put(
      'pkce:state-pending-student-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-pending-student-1',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
  it('webはMicrosoftへ302リダイレクトし、KVにpurpose: account_deletionで保存する', async () => {
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
    const stored = JSON.parse(
      (await env.AUTH_KV.get(`pkce:${state}`)) as string
    ) as PkceEntry;
    expect(stored.client_type).toBe('web');
    expect(stored.purpose).toBe('account_deletion');
    expect(stored.code_verifier).toBeTruthy();
  });

  it('mobileは有効なパラメータでauth_urlを返しKVにpurpose: account_deletionで保存し、prompt=loginを含むauth_urlを返す', async () => {
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

    const stored = JSON.parse(
      (await env.AUTH_KV.get(`pkce:${state}`)) as string
    ) as PkceEntry;
    expect(stored.client_type).toBe('mobile');
    expect(stored.purpose).toBe('account_deletion');
  });
});

describe('POST /auth/microsoft/delete-token', () => {
  it('purposeがlogin(通常/loginで発行されたstate)の場合は400 INVALID_STATE_PURPOSEを返す', async () => {
    const env = buildEnv();
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-1',
        client_type: 'web',
        purpose: 'login',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-1',
        client_type: 'web',
        purpose: 'account_deletion',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-1',
        client_type: 'web',
        purpose: 'account_deletion',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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

    // /delete-tokenはstateを消費するが、mobile_refresh/mobile_refresh_by_userは
    // 発行しない(一般API用Tokenの発行経路に入らない)。
    const mobileRefreshByUser = await env.AUTH_KV.get(
      `mobile_refresh_by_user:${user!.user_id}`
    );
    expect(mobileRefreshByUser).toBeNull();
  });

  it('stateは一度使うとKVから削除され、同じstateでの再利用はできない', async () => {
    const env = buildEnv();
    await env.AUTH_KV.put(
      'pkce:state-1',
      JSON.stringify({
        code_verifier: generateRandom(32),
        nonce: 'nonce-1',
        client_type: 'web',
        purpose: 'account_deletion',
        created_at: new Date().toISOString(),
      } satisfies PkceEntry)
    );
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
