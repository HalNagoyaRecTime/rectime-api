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
import { account } from '../../../../src/presentation/auth/routes/account';
import {
  signAccessToken,
  verifyAccessToken,
} from '../../../../src/infrastructure/auth/jwt';
import type {
  MobileRefreshEntry,
  DeletionConfirmationEntry,
} from '../../../../src/domain/auth/types';
import type { Env } from '../../../../src/lib/env';
import { diContainerMiddleware } from '../../../../src/presentation/middleware/diContainer';

const JWT_SECRET = 'a'.repeat(32);

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

let privateKeyPem: string;

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
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
    keyPair.privateKey
  )) as ArrayBuffer;
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${arrayBufferToBase64(pkcs8)}\n-----END PRIVATE KEY-----`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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
    MICROSOFT_CLIENT_ID: 'client-id',
    MICROSOFT_CLIENT_PRIVATE_KEY: 'dummy-key',
    MICROSOFT_CERT_THUMBPRINT: 'thumbprint',
    MICROSOFT_TENANT: 'common',
    ALLOWED_MICROSOFT_TENANTS: '',
    MICROSOFT_MOBILE_REDIRECT_URI: 'https://example.com/mobile-callback',
    FRONTEND_URL: 'https://example.com',
    JWT_SECRET,
    JWT_EXPIRES_SEC: '3600',
    MOBILE_REFRESH_EXPIRES_SEC: '2592000',
    STUDENT_EMAIL_DOMAIN: 'nhs.hal.ac.jp',
    ...overrides,
  };
}

function createMockKv(
  beforeDelete?: (key: string) => void | Promise<void>
): KVNamespace {
  const store = new Map<string, string>();
  return {
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    get: async (key: string) => store.get(key) ?? null,
    delete: async (key: string) => {
      await beforeDelete?.(key);
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', diContainerMiddleware);
  app.route('/', account);
  return app;
}

// /auth/refresh は users.is_live_active を確認するため(#255)、
// 実際のユーザー行が必要になる。
async function insertUser(isLiveActive = 1): Promise<string> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, ?) RETURNING user_id'
  )
    .bind('田中太郎', isLiveActive)
    .first<{ user_id: number }>();
  return String(row!.user_id);
}

async function buildLogoutToken(
  userId: string,
  clientType: 'web' | 'mobile' = 'mobile'
): Promise<string> {
  return signAccessToken(
    {
      sub: userId,
      oid: 'oid-logout',
      email: 'logout@example.com',
      display_name: 'Logout User',
      client_type: clientType,
    },
    JWT_SECRET,
    3600
  );
}

async function postLogout(
  env: Env,
  userId: string,
  body: Record<string, unknown>,
  clientType: 'web' | 'mobile' = 'mobile'
) {
  const token = await buildLogoutToken(userId, clientType);
  return buildApp().request(
    '/logout',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Client-Type': clientType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    env
  );
}

function refreshEntry(userId: string): MobileRefreshEntry {
  return {
    user_id: userId,
    oid: 'oid-logout',
    tid: 'tid-logout',
    sub: userId,
    email: 'logout@example.com',
    display_name: 'Logout User',
    client_type: 'mobile',
    ms_refresh_token: 'ms-refresh-logout',
    created_at: new Date().toISOString(),
  };
}

async function buildWebToken(): Promise<string> {
  return signAccessToken(
    {
      sub: 'user-1',
      oid: 'oid-1',
      email: 'tanaka@example.com',
      display_name: '田中太郎',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

describe('GET /auth/me', () => {
  it('webは有効なBearerトークンがあればユーザー情報のみを返す', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('田中太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token?: string;
      user?: {
        id: string;
        email: string;
        display_name: string;
        is_student: boolean;
        is_staff: boolean;
        is_teacher: boolean;
      };
    };

    expect(body.access_token).toBeUndefined();
    expect(body.user).toMatchObject({
      id: userId,
      email: 'tanaka@example.com',
      display_name: '田中太郎',
      is_student: false,
      is_staff: false,
      is_teacher: false,
    });
  });

  it('Authorizationヘッダーが無い場合は401を返す', async () => {
    const app = buildApp();

    const res = await app.request('/me', {}, buildEnv());

    expect(res.status).toBe(401);
  });

  it('mobile用に発行されたトークンをwebで使おうとすると401を返す', async () => {
    const env = buildEnv();
    const token = await signAccessToken(
      {
        sub: 'user-1',
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'mobile',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(401);
  });

  it('学生ユーザーの場合はstudent_id_number/class_room_nameを含めて返す', async () => {
    const env = buildEnv();
    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('3A', '3年A組') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '50001')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
      .run();
    const userId = String(user!.user_id);
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-student',
        email: 'gakusei@example.com',
        display_name: '学生太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user?: {
        student_id_number: string | null;
        class_code: string | null;
        class_room_name: string | null;
        attendance_number: number | null;
      };
    };
    expect(body.user).toMatchObject({
      student_id_number: '50001',
      class_code: '3A',
      class_room_name: '3年A組',
      attendance_number: 1,
    });
  });

  it('学生でないユーザーの場合はstudent_id_number/class_room_nameがnullで返る', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('教師花子') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      'INSERT INTO teachers (user_id, email) VALUES (?, ?)'
    )
      .bind(user!.user_id, `teacher-${user!.user_id}@example.test`)
      .run();
    const userId = String(user!.user_id);
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-teacher',
        email: 'sensei@example.com',
        display_name: '教師花子',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user?: {
        student_id_number: string | null;
        class_code: string | null;
        class_room_name: string | null;
        attendance_number: number | null;
      };
    };
    expect(body.user).toMatchObject({
      student_id_number: null,
      class_code: null,
      class_room_name: null,
      attendance_number: null,
    });
  });

  it('deletion_statusがdeletion_pendingのユーザーは、有効期限内のBearerトークンでも410を返す', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('削除処理中太郎', 'deletion_pending') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '削除処理中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_DELETION_PENDING');
  });

  it('deletion_statusがdeletedのユーザーは、有効期限内のBearerトークンでも410を返し名前やメールアドレスを含まない', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('削除済み太郎', 'deleted') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '削除済み太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(410);
    const bodyText = await res.text();
    expect(bodyText).not.toContain('削除済み太郎');
    expect(bodyText).not.toContain('tanaka@example.com');
  });

  it('無効化されたユーザーの場合は401を返す (#255)', async () => {
    const env = buildEnv();
    const userId = await insertUser(0);
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('USER_DEACTIVATED');
  });
});

describe('GET /auth/me/photo (削除状態)', () => {
  it('deletion_statusがdeletedのユーザーは410を返す', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('削除済み花子', 'deleted') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-1',
        email: 'hanako@example.com',
        display_name: '削除済み花子',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/me/photo',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_DELETION_PENDING');
  });
});

describe('GET /auth/me/photo', () => {
  describe.each(['web', 'mobile'] as const)('%sの写真取得', clientType => {
    async function preparePhoto() {
      const env = buildEnv({ MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem });
      const userId = await insertUser();
      const entry = { ...refreshEntry(userId), client_type: clientType };
      const stored = JSON.stringify(entry);
      const key = 'mobile_refresh:photo-refresh';
      await env.AUTH_KV.put(key, stored);
      await env.AUTH_KV.put(
        `mobile_refresh_by_user:${userId}`,
        'photo-refresh'
      );
      const token = await buildLogoutToken(userId, clientType);
      const put = vi.spyOn(env.AUTH_KV, 'put');
      const remove = vi.spyOn(env.AUTH_KV, 'delete');
      const request = () =>
        buildApp().request(
          '/me/photo',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Client-Type': clientType,
            },
          },
          env
        );
      return { env, key, stored, put, remove, request };
    }

    it.each([true, false])(
      'Microsoftが更新トークンを返す=%sの場合も写真を取得できる',
      async rotates => {
        const session = await preparePhoto();
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                access_token: 'graph-access',
                ...(rotates ? { refresh_token: 'new-refresh' } : {}),
              })
            )
          )
          .mockResolvedValueOnce(
            new Response('image-data', {
              headers: { 'Content-Type': 'image/png' },
            })
          );
        vi.stubGlobal('fetch', fetchMock);
        const res = await session.request();
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/png');
        expect(new Uint8Array(await res.arrayBuffer())).toEqual(
          new TextEncoder().encode('image-data')
        );
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
          'Bearer graph-access'
        );
        const entry = JSON.parse((await session.env.AUTH_KV.get(session.key))!);
        expect(entry.ms_refresh_token).toBe(
          rotates ? 'new-refresh' : 'ms-refresh-logout'
        );
        expect(session.remove).not.toHaveBeenCalled();
      }
    );

    it.each([
      [503, { error: 'invalid_grant' }, 503, 'AUTH_REFRESH_UNAVAILABLE'],
      [400, { error: 'invalid_client' }, 500, 'AUTH_PROVIDER_ERROR'],
      [400, { error: 'invalid_grant' }, 401, 'GRAPH_TOKEN_EXCHANGE_FAILED'],
      [
        200,
        { refresh_token: 'refresh-without-access' },
        503,
        'AUTH_REFRESH_UNAVAILABLE',
      ],
    ])(
      '上流%s / %jは%sを返し保存済み認証を変更しない',
      async (status, payload, expectedStatus, code) => {
        const session = await preparePhoto();
        const fetchMock = vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify(payload), { status }));
        vi.stubGlobal('fetch', fetchMock);
        const res = await session.request();
        expect(res.status).toBe(expectedStatus);
        expect(await res.json()).toEqual({
          error: { code, message: expect.any(String) },
        });
        expect(await session.env.AUTH_KV.get(session.key)).toBe(session.stored);
        expect(session.put).not.toHaveBeenCalled();
        expect(session.remove).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      }
    );

    it('Graphの404は従来の写真なしを返す', async () => {
      const session = await preparePhoto();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            new Response(JSON.stringify({ access_token: 'graph-access' }))
          )
          .mockResolvedValueOnce(new Response('', { status: 404 }))
      );
      const res = await session.request();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: 'PHOTO_NOT_FOUND', message: expect.any(String) },
      });
    });
  });

  it('無効化されたユーザーの場合は401を返し、Microsoftへ問い合わせない (#255)', async () => {
    const env = buildEnv({ MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem });
    const userId = await insertUser(0);
    // 無効化の確認がKV参照・Microsoft問い合わせより前に行われることを示すため、
    // セッションは有効な状態で用意しておく。
    await env.AUTH_KV.put(`mobile_refresh_by_user:${userId}`, 'refresh-1');
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: userId,
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const app = buildApp();

    const res = await app.request(
      '/me/photo',
      { headers: { Authorization: `Bearer ${token}` } },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('USER_DEACTIVATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /auth/logout', () => {
  it('mobileは要求元ユーザーの指定FCM Tokenだけを削除し、refresh sessionも掃除する', async () => {
    const userId = await insertUser();
    const otherUserId = await insertUser();
    const env = buildEnv();
    for (const [ownerId, tokenValue] of [
      [userId, 'logout-current-token'],
      [userId, 'logout-other-device-token'],
      [otherUserId, 'logout-other-user-token'],
    ] as const) {
      await workerEnv.DB.prepare(
        'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?)'
      )
        .bind(Number(ownerId), tokenValue)
        .run();
    }
    const entry = refreshEntry(userId);
    await env.AUTH_KV.put(
      'mobile_refresh:logout-refresh',
      JSON.stringify(entry)
    );
    await env.AUTH_KV.put(`mobile_refresh_by_user:${userId}`, 'logout-refresh');

    const res = await postLogout(env, userId, {
      refresh_token_id: 'logout-refresh',
      fcm_token: 'logout-current-token',
    });

    expect(res.status).toBe(200);
    const rows = await workerEnv.DB.prepare(
      'SELECT user_id, fcm_token FROM firebase_tokens ORDER BY user_id, fcm_token'
    ).all<{ user_id: number; fcm_token: string }>();
    expect(rows.results).toEqual([
      { user_id: Number(userId), fcm_token: 'logout-other-device-token' },
      { user_id: Number(otherUserId), fcm_token: 'logout-other-user-token' },
    ]);
    expect(await env.AUTH_KV.get('mobile_refresh:logout-refresh')).toBeNull();
    expect(
      await env.AUTH_KV.get(`mobile_refresh_by_user:${userId}`)
    ).toBeNull();
  });

  it('前後空白を含むFCM Tokenは保存値との完全一致でlogout削除する', async () => {
    const userId = await insertUser();
    const env = buildEnv();
    const fcmToken = ' token-with-space ';
    await workerEnv.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?)'
    )
      .bind(Number(userId), fcmToken)
      .run();

    const res = await postLogout(env, userId, { fcm_token: fcmToken });

    expect(res.status).toBe(200);
    const token = await workerEnv.DB.prepare(
      'SELECT firebase_token_id FROM firebase_tokens WHERE user_id = ? AND fcm_token = ?'
    )
      .bind(Number(userId), fcmToken)
      .first<{ firebase_token_id: number }>();
    expect(token).toBeNull();
  });

  it('前後空白を含むFCM Tokenをtrim後の値としては削除しない', async () => {
    const userId = await insertUser();
    const env = buildEnv();
    const storedToken = ' token-with-space ';
    await workerEnv.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?)'
    )
      .bind(Number(userId), storedToken)
      .run();

    const res = await postLogout(env, userId, {
      fcm_token: 'token-with-space',
    });

    expect(res.status).toBe(200);
    const token = await workerEnv.DB.prepare(
      'SELECT firebase_token_id FROM firebase_tokens WHERE user_id = ? AND fcm_token = ?'
    )
      .bind(Number(userId), storedToken)
      .first<{ firebase_token_id: number }>();
    expect(token).not.toBeNull();
  });

  it('他ユーザーのFCM Tokenは要求元ユーザーのlogoutで削除しない', async () => {
    const userId = await insertUser();
    const otherUserId = await insertUser();
    const env = buildEnv();
    await workerEnv.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?)'
    )
      .bind(Number(otherUserId), 'logout-foreign-token')
      .run();

    const res = await postLogout(env, userId, {
      fcm_token: 'logout-foreign-token',
    });

    expect(res.status).toBe(200);
    const token = await workerEnv.DB.prepare(
      'SELECT user_id FROM firebase_tokens WHERE fcm_token = ?'
    )
      .bind('logout-foreign-token')
      .first<{ user_id: number }>();
    expect(token?.user_id).toBe(Number(otherUserId));
  });

  it('FCM Tokenやrefresh sessionが無くても繰り返し成功する', async () => {
    const userId = await insertUser();
    const env = buildEnv();

    const first = await postLogout(env, userId, {});
    const second = await postLogout(env, userId, {});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('一部のKV削除が失敗しても他のcleanupを試み、再試行できる', async () => {
    const userId = await insertUser();
    let failRefreshDelete = true;
    const authKv = createMockKv(key => {
      if (key === 'mobile_refresh:logout-retry' && failRefreshDelete) {
        failRefreshDelete = false;
        throw new Error('KV unavailable');
      }
    });
    const env = buildEnv({ AUTH_KV: authKv });
    await authKv.put(
      'mobile_refresh:logout-retry',
      JSON.stringify(refreshEntry(userId))
    );
    await authKv.put(`mobile_refresh_by_user:${userId}`, 'logout-retry');

    const failed = await postLogout(env, userId, {});
    expect(failed.status).toBe(500);
    expect(await authKv.get(`mobile_refresh_by_user:${userId}`)).toBe(
      'logout-retry'
    );
    expect(await authKv.get('mobile_refresh:logout-retry')).not.toBeNull();

    const retried = await postLogout(env, userId, {});
    expect(retried.status).toBe(200);
    expect(await authKv.get('mobile_refresh:logout-retry')).toBeNull();
  });
  it('webはBearerトークンが無い場合は401を返す', async () => {
    const app = buildApp();

    const res = await app.request('/logout', { method: 'POST' }, buildEnv());

    expect(res.status).toBe(401);
  });

  it('webは有効なBearerトークンとrefresh_token_idを指定するとKVエントリを削除して成功する', async () => {
    const env = buildEnv();
    const token = await buildWebToken();
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: 'user-1',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );
    await env.AUTH_KV.put('mobile_refresh_by_user:user-1', 'refresh-1');
    const app = buildApp();

    const res = await app.request(
      '/logout',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Logged out successfully' });
    expect(await env.AUTH_KV.get('mobile_refresh:refresh-1')).toBeNull();
    expect(await env.AUTH_KV.get('mobile_refresh_by_user:user-1')).toBeNull();
  });

  it('他ユーザーが所有するrefresh_token_idを指定しても削除しない', async () => {
    const env = buildEnv();
    const token = await buildWebToken();
    const otherUsersEntry = JSON.stringify({
      user_id: 'other-user',
      oid: 'oid-other',
      tid: 'tid-1',
      sub: 'sub-other',
      email: 'other@example.com',
      display_name: '他ユーザー',
      client_type: 'web',
      ms_refresh_token: 'ms-refresh-other',
      created_at: new Date().toISOString(),
    } satisfies MobileRefreshEntry);
    await env.AUTH_KV.put(
      'mobile_refresh:other-users-refresh',
      otherUsersEntry
    );
    const app = buildApp();

    const res = await app.request(
      '/logout',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'other-users-refresh' }),
      },
      env
    );

    expect(res.status).toBe(200);
    expect(await env.AUTH_KV.get('mobile_refresh:other-users-refresh')).toBe(
      otherUsersEntry
    );
  });

  it('deletion_statusがdeletedのユーザーは410を返す', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('削除済み太郎', 'deleted') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);
    const token = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '削除済み太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const app = buildApp();

    const res = await app.request(
      '/logout',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      env
    );

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_DELETION_PENDING');
  });
});

describe('POST /auth/refresh', () => {
  async function prepareRefresh(
    clientType: 'web' | 'mobile',
    overrides: Partial<Env> = {}
  ) {
    const env = buildEnv({
      MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem,
      ...overrides,
    });
    const userId = await insertUser();
    const stored = JSON.stringify({
      ...refreshEntry(userId),
      client_type: clientType,
    });
    const key = 'mobile_refresh:refresh-failure';
    const userKey = `mobile_refresh_by_user:${userId}`;
    await env.AUTH_KV.put(key, stored);
    await env.AUTH_KV.put(userKey, 'refresh-failure');
    const put = vi.spyOn(env.AUTH_KV, 'put');
    const remove = vi.spyOn(env.AUTH_KV, 'delete');
    const request = () =>
      buildApp().request(
        '/refresh',
        {
          method: 'POST',
          headers: {
            'X-Client-Type': clientType,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token_id: 'refresh-failure' }),
        },
        env
      );
    const expectUnchanged = async () => {
      expect(await env.AUTH_KV.get(key)).toBe(stored);
      expect(await env.AUTH_KV.get(userKey)).toBe('refresh-failure');
      expect(put).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    };
    return { env, key, userKey, put, remove, request, expectUnchanged };
  }

  describe.each(['web', 'mobile'] as const)(
    '%sの障害後も同じ更新IDを維持する',
    clientType => {
      it.each([
        [
          400,
          { error: 'temporarily_unavailable' },
          503,
          'AUTH_REFRESH_UNAVAILABLE',
        ],
        [429, { error: 'invalid_grant' }, 503, 'AUTH_REFRESH_UNAVAILABLE'],
        [500, { error: 'invalid_grant' }, 503, 'AUTH_REFRESH_UNAVAILABLE'],
        [
          503,
          { error: 'interaction_required' },
          503,
          'AUTH_REFRESH_UNAVAILABLE',
        ],
        [400, { error: 'invalid_client' }, 500, 'AUTH_PROVIDER_ERROR'],
        [400, { error: 'invalid_scope' }, 500, 'AUTH_PROVIDER_ERROR'],
        [400, { error: 'unknown' }, 500, 'AUTH_PROVIDER_ERROR'],
        [400, { error: 'INVALID_GRANT' }, 500, 'AUTH_PROVIDER_ERROR'],
        [401, { error: 'invalid_grant' }, 500, 'AUTH_PROVIDER_ERROR'],
        [400, { error: 'invalid_grant' }, 401, 'REFRESH_TOKEN_EXPIRED'],
        [400, { error: 'interaction_required' }, 401, 'REFRESH_TOKEN_EXPIRED'],
        [200, { refresh_token: 'new' }, 503, 'AUTH_REFRESH_UNAVAILABLE'],
        [200, { access_token: 'access' }, 503, 'AUTH_REFRESH_UNAVAILABLE'],
        [
          200,
          { access_token: 'access', refresh_token: 123 },
          503,
          'AUTH_REFRESH_UNAVAILABLE',
        ],
        [
          200,
          { access_token: 'access', refresh_token: '' },
          503,
          'AUTH_REFRESH_UNAVAILABLE',
        ],
        [200, null, 503, 'AUTH_REFRESH_UNAVAILABLE'],
        [200, [], 503, 'AUTH_REFRESH_UNAVAILABLE'],
      ])(
        'HTTP %s / %jは%s / %sを返しKVを書き換えない',
        async (status, payload, expectedStatus, code) => {
          const session = await prepareRefresh(clientType);
          const fetchMock = vi
            .fn()
            .mockResolvedValue(
              new Response(JSON.stringify(payload), { status })
            );
          vi.stubGlobal('fetch', fetchMock);
          const res = await session.request();
          expect(res.status).toBe(expectedStatus);
          expect(await res.json()).toEqual({
            error: { code, message: expect.any(String) },
          });
          await session.expectUnchanged();
          expect(fetchMock).toHaveBeenCalledTimes(1);
        }
      );

      it.each([200, 400])(
        'HTTP %sのJSON解析失敗でも認証失効にしない',
        async status => {
          const session = await prepareRefresh(clientType);
          vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('invalid-json', { status }))
          );
          expect((await session.request()).status).toBe(503);
          await session.expectUnchanged();
        }
      );

      it('通信例外では503を返し更新情報を残す', async () => {
        const session = await prepareRefresh(clientType);
        vi.stubGlobal(
          'fetch',
          vi.fn().mockRejectedValue(new Error('接続失敗'))
        );
        const res = await session.request();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({
          error: {
            code: 'AUTH_REFRESH_UNAVAILABLE',
            message: '認証の更新を一時的に確認できません',
          },
        });
        await session.expectUnchanged();
      });

      it('一時障害の後に同じIDで成功し、成功時だけTTLを付け直してローテーションする', async () => {
        const session = await prepareRefresh(clientType, {
          MOBILE_REFRESH_EXPIRES_SEC: undefined,
        });
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(new Response('{}', { status: 503 }))
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                access_token: 'new-access',
                refresh_token: 'new-refresh',
              })
            )
          );
        vi.stubGlobal('fetch', fetchMock);
        expect((await session.request()).status).toBe(503);
        await session.expectUnchanged();
        const res = await session.request();
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          access_token: string;
          refresh_token_id: string;
          token_type: string;
          expires_in: number;
        };
        expect(body).toEqual({
          access_token: expect.any(String),
          refresh_token_id: expect.any(String),
          token_type: 'Bearer',
          expires_in: 3600,
        });
        expect(body.refresh_token_id).not.toBe('refresh-failure');
        expect(await session.env.AUTH_KV.get(session.key)).toBeNull();
        expect(await session.env.AUTH_KV.get(session.userKey)).toBe(
          body.refresh_token_id
        );
        const saved = JSON.parse(
          (await session.env.AUTH_KV.get(
            `mobile_refresh:${body.refresh_token_id}`
          ))!
        );
        expect(saved.ms_refresh_token).toBe('new-refresh');
        expect(saved.client_type).toBe(clientType);
        expect(session.put).toHaveBeenCalledTimes(2);
        expect(
          session.put.mock.calls.every(
            call => call[2]?.expirationTtl === 7776000
          )
        ).toBe(true);
        const claims = await verifyAccessToken(
          body.access_token,
          JWT_SECRET,
          clientType
        );
        expect(claims?.client_type).toBe(clientType);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
    }
  );

  it('証明書設定の不備は500を返し更新情報を残す', async () => {
    const session = await prepareRefresh('web', {
      MICROSOFT_CLIENT_PRIVATE_KEY: 'invalid-key',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await session.request()).status).toBe(500);
    await session.expectUnchanged();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('接続タイムアウトでも503で終了し、旧ID・TTLを維持する', async () => {
    const session = await prepareRefresh('mobile');
    vi.useFakeTimers();
    let started!: () => void;
    const fetchStarted = new Promise<void>(resolve => {
      started = resolve;
    });
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        started();
        return new Promise<Response>(() => {});
      })
    );
    const pending = session.request();
    await fetchStarted;
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).status).toBe(503);
    expect(signal?.aborted).toBe(true);
    await session.expectUnchanged();
  });

  it('refresh_token_idが無い場合は400を返す', async () => {
    const app = buildApp();

    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      buildEnv()
    );

    expect(res.status).toBe(400);
  });

  it('存在しないrefresh_token_idの場合は401を返す', async () => {
    const app = buildApp();

    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token_id: 'unknown' }),
      },
      buildEnv()
    );

    expect(res.status).toBe(401);
  });

  it('mobile向けに発行されたrefresh_token_idをwebから使おうとすると400を返す', async () => {
    const env = buildEnv();
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-mobile-1',
      JSON.stringify({
        user_id: 'user-1',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'mobile',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );
    const app = buildApp();

    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-mobile-1' }),
      },
      env
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_REFRESH_CLIENT_TYPE');
    // クライアント種別不一致時はKVのエントリを消費(ローテーション)しない
    expect(
      await env.AUTH_KV.get('mobile_refresh:refresh-mobile-1')
    ).not.toBeNull();
  });

  it('webは有効なrefresh_token_idを指定すると新しいアクセストークンを発行しIDをローテーションする', async () => {
    const env = buildEnv({ MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem });
    const userId = await insertUser();
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: userId,
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'graph-access-1',
          refresh_token: 'ms-refresh-2',
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp();
    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      access_token: string;
      refresh_token_id: string;
      token_type: string;
      expires_in: number;
    };
    expect(body.token_type).toBe('Bearer');
    expect(body.refresh_token_id).not.toBe('refresh-1');
    expect(await env.AUTH_KV.get('mobile_refresh:refresh-1')).toBeNull();
    expect(
      await env.AUTH_KV.get(`mobile_refresh:${body.refresh_token_id}`)
    ).not.toBeNull();
  });

  it('Microsoftのリフレッシュに失敗した場合は401を返す', async () => {
    const env = buildEnv({ MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem });
    const userId = await insertUser();
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: userId,
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp();
    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('deletion_statusがdeletion_pendingのユーザーは新しいアクセストークンを発行できない', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('削除処理中太郎', 'deletion_pending') RETURNING user_id"
    ).first<{ user_id: number }>();
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: String(user!.user_id),
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '削除処理中太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );
    const app = buildApp();

    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_DELETION_PENDING');
    // refresh_token_idは消費(ローテーション)されず、KVに残ったまま
    expect(await env.AUTH_KV.get('mobile_refresh:refresh-1')).not.toBeNull();
  });

  it('deletion_statusがdeletedのユーザーは新しいアクセストークンを発行できない', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status) VALUES ('削除済み太郎', 'deleted') RETURNING user_id"
    ).first<{ user_id: number }>();
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: String(user!.user_id),
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '削除済み太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );
    const app = buildApp();

    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_DELETION_PENDING');
  });

  it('無効化されたユーザーの場合は401を返し、Microsoftへ問い合わせない (#255)', async () => {
    const env = buildEnv({ MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem });
    const userId = await insertUser(0);
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: userId,
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const app = buildApp();
    const res = await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('USER_DEACTIVATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('無効化されたユーザーの場合はrefresh_token_idをローテーションせず、TTLを延長しない (#255)', async () => {
    const env = buildEnv({ MICROSOFT_CLIENT_PRIVATE_KEY: privateKeyPem });
    const userId = await insertUser(0);
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-1',
      JSON.stringify({
        user_id: userId,
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );
    vi.stubGlobal('fetch', vi.fn());

    const app = buildApp();
    await app.request(
      '/refresh',
      {
        method: 'POST',
        headers: {
          'X-Client-Type': 'web',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token_id: 'refresh-1' }),
      },
      env
    );

    // 既存エントリは消さない（再度有効化されたときに同じセッションを
    // 再開できるようにするため）が、新しいIDの発行は行わない。
    // ローテーションが起きていれば mobile_refresh_by_user が書かれるため、
    // それが無いことで「TTLの振り直しが起きていない」ことを確認する。
    expect(await env.AUTH_KV.get('mobile_refresh:refresh-1')).not.toBeNull();
    expect(
      await env.AUTH_KV.get(`mobile_refresh_by_user:${userId}`)
    ).toBeNull();
  });
});

describe('DELETE /auth/me', () => {
  it('deletion_confirmation_tokenが無い場合は400を返す', async () => {
    const app = buildApp();

    const res = await app.request(
      '/me',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      buildEnv()
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_REQUEST');
  });

  it('存在しないdeletion_confirmation_tokenの場合は401を返す', async () => {
    const app = buildApp();

    const res = await app.request(
      '/me',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletion_confirmation_token: 'unknown' }),
      },
      buildEnv()
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('DELETION_CONFIRMATION_TOKEN_INVALID');
  });

  it('有効なdeletion_confirmation_tokenで削除を実行し202を返す。全Session・関連データが削除される', async () => {
    const env = buildEnv();

    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('削除対象太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);
    await workerEnv.DB.prepare(
      "INSERT INTO microsoft_account_links (user_id, oid, tid) VALUES (?, 'oid-1', 'tid-1')"
    )
      .bind(user!.user_id)
      .run();
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();
    await workerEnv.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'fcm-token-delete-me')"
    )
      .bind(user!.user_id)
      .run();
    await env.AUTH_KV.put(
      'mobile_refresh:refresh-delete-me',
      JSON.stringify({
        user_id: userId,
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '削除対象太郎',
        client_type: 'web',
        ms_refresh_token: 'ms-refresh-1',
        created_at: new Date().toISOString(),
      } satisfies MobileRefreshEntry)
    );
    await env.AUTH_KV.put(
      `mobile_refresh_by_user:${userId}`,
      'refresh-delete-me'
    );

    const deletionToken = 'deletion-token-1';
    await env.AUTH_KV.put(
      `deletion_confirmation:${deletionToken}`,
      JSON.stringify({
        user_id: userId,
        created_at: new Date().toISOString(),
      } satisfies DeletionConfirmationEntry)
    );

    const app = buildApp();
    const res = await app.request(
      '/me',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletion_confirmation_token: deletionToken }),
      },
      env
    );

    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');

    // deletion_confirmation_tokenは消費され、リプレイできない
    // (削除ではなく空文字への置き換えで消費済みマーカーにする)
    expect(
      await env.AUTH_KV.get(`deletion_confirmation:${deletionToken}`)
    ).toBe('');

    // DB: deletion_status: deleted、Microsoft連携解除
    const userRow = await workerEnv.DB.prepare(
      'SELECT deletion_status FROM users WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ deletion_status: string }>();
    expect(userRow?.deletion_status).toBe('deleted');
    const linkRow = await workerEnv.DB.prepare(
      'SELECT * FROM microsoft_account_links WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(linkRow).toBeNull();

    // KV: 全Refresh Sessionが失効
    expect(
      await env.AUTH_KV.get('mobile_refresh:refresh-delete-me')
    ).toBeNull();
    expect(
      await env.AUTH_KV.get(`mobile_refresh_by_user:${userId}`)
    ).toBeNull();

    // Firebase Token: 物理削除(Push通知対象から除外)
    const tokenRow = await workerEnv.DB.prepare(
      'SELECT * FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(tokenRow).toBeNull();

    // 関連データ: staffs解除
    const staffRow = await workerEnv.DB.prepare(
      'SELECT * FROM staffs WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(staffRow).toBeNull();
  });

  it('同じdeletion_confirmation_tokenを2回使うと2回目は401を返す(リプレイ拒否)', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('リプレイ太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    const deletionToken = 'deletion-token-replay';
    await env.AUTH_KV.put(
      `deletion_confirmation:${deletionToken}`,
      JSON.stringify({
        user_id: String(user!.user_id),
        created_at: new Date().toISOString(),
      } satisfies DeletionConfirmationEntry)
    );
    const app = buildApp();

    const firstRes = await app.request(
      '/me',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletion_confirmation_token: deletionToken }),
      },
      env
    );
    expect(firstRes.status).toBe(202);

    const secondRes = await app.request(
      '/me',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletion_confirmation_token: deletionToken }),
      },
      env
    );

    expect(secondRes.status).toBe(401);
    const body = (await secondRes.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('DELETION_CONFIRMATION_TOKEN_INVALID');
  });

  it('削除後、同じユーザーのAccess Tokenで/auth/meを呼ぶと410を返す', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('削除後確認太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = String(user!.user_id);
    const deletionToken = 'deletion-token-verify-me';
    await env.AUTH_KV.put(
      `deletion_confirmation:${deletionToken}`,
      JSON.stringify({
        user_id: userId,
        created_at: new Date().toISOString(),
      } satisfies DeletionConfirmationEntry)
    );
    const app = buildApp();

    await app.request(
      '/me',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletion_confirmation_token: deletionToken }),
      },
      env
    );

    const accessToken = await signAccessToken(
      {
        sub: userId,
        oid: 'oid-1',
        email: 'tanaka@example.com',
        display_name: '削除後確認太郎',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    const meRes = await app.request(
      '/me',
      { headers: { Authorization: `Bearer ${accessToken}` } },
      env
    );

    expect(meRes.status).toBe(410);
  });

  it('後片付けが既に完了済みの利用者に対して呼ぶと409 ACCOUNT_ALREADY_PURGEDを返す', async () => {
    // 通常フローでは起こらないが、同一利用者に対して複数の
    // deletion_confirmation_tokenが発行され、片方が先に処理を完了させた
    // 後にもう片方のDELETEが実行される、といった並行実行時に
    // AccountDeletionService.deleteRelatedDataがACCOUNT_ALREADY_PURGEDを
    // throwする(#265 PR4)。account.ts側でこれをAPIエラーへ変換できて
    // いることを確認する。
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name, deletion_status, purged_at) VALUES ('後片付け完了済み太郎', 'deleted', CURRENT_TIMESTAMP) RETURNING user_id"
    ).first<{ user_id: number }>();
    const deletionToken = 'deletion-token-already-purged';
    await env.AUTH_KV.put(
      `deletion_confirmation:${deletionToken}`,
      JSON.stringify({
        user_id: String(user!.user_id),
        created_at: new Date().toISOString(),
      } satisfies DeletionConfirmationEntry)
    );
    const app = buildApp();

    const res = await app.request(
      '/me',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deletion_confirmation_token: deletionToken }),
      },
      env
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('ACCOUNT_ALREADY_PURGED');
  });
});
