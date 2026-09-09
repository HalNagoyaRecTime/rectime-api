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
import { signAccessToken } from '../../../../src/infrastructure/auth/jwt';
import type {
  MobileRefreshEntry,
  DeletionConfirmationEntry,
} from '../../../../src/domain/auth/types';
import type { Env } from '../../../../src/lib/env';
import { diContainerMiddleware } from '../../../../src/presentation/middleware/diContainer';
import { insertClassRoomWithTeam } from '../../../fixtures/classRooms';

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
    TEST_FCM_TOKEN: 'test-token',
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

function createMockKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    get: async (key: string) => store.get(key) ?? null,
    delete: async (key: string) => {
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
    const classRoom = await insertClassRoomWithTeam(workerEnv.DB, {
      classCode: '3A',
      className: '3年A組',
    });
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '50001')"
    )
      .bind(user!.user_id, classRoom.classRoomId)
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
        class_room_name: string | null;
      };
    };
    expect(body.user).toMatchObject({
      student_id_number: '50001',
      class_room_name: '3年A組',
    });
  });

  it('学生でないユーザーの場合はstudent_id_number/class_room_nameがnullで返る', async () => {
    const env = buildEnv();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('教師花子') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
      .bind(user!.user_id)
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
        class_room_name: string | null;
      };
    };
    expect(body.user).toMatchObject({
      student_id_number: null,
      class_room_name: null,
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
