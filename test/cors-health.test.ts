import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import { errorResponseSchema } from '../src/presentation/openapi/schemas';
import { eventListResponseSchema } from '../src/presentation/openapi/events';

const corsTestEnv = {
  ...env,
  ALLOWED_ORIGINS:
    'http://localhost:5173,https://recwatch.pages.dev,https://*.recwatch.pages.dev',
};

// signAccessToken は32バイト以上のシークレットを要求する。
const JWT_SECRET = 'a'.repeat(32);
const authEnv = { ...env, JWT_SECRET };

/** apiV1配下は全ルートが認証必須のため、契約検証にもトークンが要る。 */
async function bearerHeaders(): Promise<Record<string, string>> {
  const token = await signAccessToken(
    {
      sub: '1',
      oid: 'oid-1',
      email: 'contract@example.com',
      display_name: '契約テスト',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
  return { Authorization: `Bearer ${token}` };
}

describe('GET /health', () => {
  it('200 と { status: "ok" } を返す', async () => {
    const res = await app.fetch(new Request('http://example.com/health'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('OpenAPI documentation', () => {
  it('/openapi.json に実装済みのAPI仕様を返す', async () => {
    const res = await app.fetch(
      new Request('http://example.com/openapi.json'),
      env
    );

    expect(res.status).toBe(200);
    const document = (await res.json()) as {
      components: {
        schemas: Record<string, { properties?: Record<string, unknown> }>;
        securitySchemes?: Record<string, unknown>;
      };
      paths: Record<string, Record<string, unknown>>;
    };

    expect(Object.keys(document.paths).sort()).toEqual([
      '/',
      '/api/v1/admin/notifications',
      '/api/v1/admin/notifications/{notificationId}',
      '/api/v1/admin/users/{userId}',
      '/api/v1/admin/users/{userId}/staff',
      '/api/v1/classrooms',
      '/api/v1/classrooms/{classId}',
      '/api/v1/events',
      '/api/v1/events/{eventId}',
      '/api/v1/events/{eventId}/gatherings',
      '/api/v1/firebase-tokens',
      '/api/v1/gathering-spots',
      '/api/v1/gathering-spots/{gatheringSpotId}',
      '/api/v1/gatherings',
      '/api/v1/gatherings/{gatheringId}/members',
      '/api/v1/master-imports',
      '/api/v1/master-imports/{validatedFileId}',
      '/api/v1/master-imports/{validatedFileId}/commit',
      '/api/v1/me/notifications',
      '/api/v1/me/notifications/{notificationId}',
      '/api/v1/staffs',
      '/api/v1/staffs/{staffId}',
      '/api/v1/students',
      '/api/v1/students/{studentId}',
      '/api/v1/teachers',
      '/api/v1/teachers/{teacherId}',
      '/api/v1/venues',
      '/api/v1/venues/{venueId}',
      '/health',
    ]);
    expect(document.components.schemas.Event.properties?.rule_text).toEqual({
      type: 'string',
      nullable: true,
    });

    const teacherListParameters = (
      document.paths['/api/v1/teachers'].get as {
        parameters?: Array<{
          name: string;
          schema?: { default?: unknown; enum?: unknown[] };
        }>;
      }
    ).parameters;
    expect(
      teacherListParameters?.find(param => param.name === 'isStaff')?.schema
    ).toMatchObject({ default: 'all', enum: ['true', 'false', 'all'] });
    expect(
      teacherListParameters?.find(param => param.name === 'isLiveActive')
        ?.schema
    ).toMatchObject({ default: 'true', enum: ['true', 'false', 'all'] });
    expect(
      teacherListParameters?.find(param => param.name === 'sortBy')?.schema
    ).toMatchObject({
      default: 'teacherId',
      enum: [
        'teacherId',
        'displayName',
        'classCode',
        'className',
        'isStaff',
        'isLiveActive',
      ],
    });

    expect(document.paths['/api/v1/teachers/{teacherId}']).not.toHaveProperty(
      'delete'
    );

    const studentListParameters = (
      document.paths['/api/v1/students'].get as {
        parameters?: Array<{
          name: string;
          schema?: { default?: unknown; enum?: unknown[] };
        }>;
      }
    ).parameters;
    expect(
      studentListParameters?.find(param => param.name === 'isStaff')?.schema
    ).toMatchObject({ default: 'all', enum: ['true', 'false', 'all'] });
    expect(
      studentListParameters?.find(param => param.name === 'isLiveActive')
        ?.schema
    ).toMatchObject({ default: 'true', enum: ['true', 'false', 'all'] });
    expect(
      studentListParameters?.find(param => param.name === 'sortBy')?.schema
    ).toMatchObject({
      default: 'studentId',
      enum: [
        'studentId',
        'studentIdNumber',
        'displayName',
        'classCode',
        'className',
        'attendanceNumber',
        'isStaff',
        'isLiveActive',
      ],
    });

    const documentedOperations = Object.values(document.paths).flatMap(path =>
      Object.keys(path).filter(method =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(method)
      )
    );
    expect(documentedOperations).toHaveLength(50);
    expect(
      document.paths['/api/v1/admin/notifications/{notificationId}']
    ).toHaveProperty('patch');
    expect(document.components.schemas).not.toHaveProperty(
      'AdminUserSearchItem'
    );
    expect(document.components.schemas).not.toHaveProperty(
      'AdminUserSearchResponse'
    );
    expect(document.paths['/api/v1/gatherings']).not.toHaveProperty('post');
    expect(
      Object.keys(document.paths['/api/v1/gatherings/{gatheringId}/members'])
    ).toEqual(['get', 'put']);
    expect(document.paths).not.toHaveProperty(
      '/api/v1/gatherings/{gatheringId}/members/{userId}'
    );
    expect(document.components.schemas).not.toHaveProperty(
      'CreateGatheringRequest'
    );
    expect(document.paths['/api/v1/events/{eventId}']).not.toHaveProperty(
      'patch'
    );
    expect(document.paths['/api/v1/events/{eventId}']).toHaveProperty('put');
    expect(document.components.schemas).not.toHaveProperty(
      'AddGatheringMemberRequest'
    );
  });

  it('認証が必要なルートにBearer認証を定義する', async () => {
    const res = await app.fetch(
      new Request('http://example.com/openapi.json'),
      env
    );
    const document = (await res.json()) as {
      components: { securitySchemes?: Record<string, unknown> };
      paths: Record<string, Record<string, { security?: unknown }>>;
    };

    expect(document.components.securitySchemes).toEqual({
      Bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    });
    expect(document.paths['/api/v1/students'].get?.security).toEqual([
      { Bearer: [] },
    ]);
    expect(
      document.paths['/api/v1/admin/users/{userId}'].patch?.security
    ).toEqual([{ Bearer: [] }]);
    // 認証を要さないルートにはsecurityを付けない。
    expect(document.paths['/health'].get?.security).toBeUndefined();
  });

  it('/docs が /openapi.json を読むSwagger UIを返す', async () => {
    const res = await app.fetch(new Request('http://example.com/docs'), env);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("url: '/openapi.json'");
  });

  it.each(['/openapi.json', '/docs'])(
    'DOCS_ENABLED が未設定なら %s を公開しない',
    async path => {
      const res = await app.fetch(new Request(`http://example.com${path}`), {
        ...env,
        DOCS_ENABLED: undefined,
      });

      expect(res.status).toBe(404);
    }
  );

  it('DOCS_ENABLED が未設定なら / から仕様エンドポイントを案内しない', async () => {
    const res = await app.fetch(new Request('http://example.com/'), {
      ...env,
      DOCS_ENABLED: undefined,
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).not.toHaveProperty('openapi');
    expect(body).not.toHaveProperty('docs');
  });

  it('DOCS_ENABLED が有効なら / から仕様エンドポイントを案内する', async () => {
    const res = await app.fetch(new Request('http://example.com/'), env);

    expect(await res.json()).toMatchObject({
      openapi: '/openapi.json',
      docs: '/docs',
    });
  });
});

describe('OpenAPIスキーマと実レスポンスの一致', () => {
  it('スキーマがリクエストを弾いた場合も文書化された400形式で返す', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/events/not-a-number', {
        headers: await bearerHeaders(),
      }),
      authEnv
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    // 組み込みフックの `{ success: false, error: <ZodError> }` ではなく、
    // 各ルートが400として文書化しているスキーマに一致すること。
    expect(errorResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      error: {
        message: 'リクエスト内容が正しくありません',
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('成功レスポンスの本文が文書化されたスキーマに一致する', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/events', {
        headers: await bearerHeaders(),
      }),
      authEnv
    );

    expect(res.status).toBe(200);
    const parsed = eventListResponseSchema.safeParse(await res.json());
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });
});

describe('管理画面向けUser横断検索APIの廃止', () => {
  it('認証の有無にかかわらず検索APIを公開しない', async () => {
    for (const headers of [{}, await bearerHeaders()]) {
      const response = await app.fetch(
        new Request('http://example.com/api/v1/admin/users', { headers }),
        authEnv
      );
      expect(response.status).toBe(404);
    }
  });

  it('API概要で廃止した検索APIを案内しない', async () => {
    const response = await app.fetch(new Request('http://example.com/'), env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      endpoints: Record<string, string>;
    };
    expect(body.endpoints).not.toHaveProperty('adminUsers');
    expect(Object.values(body.endpoints)).not.toContain('/api/v1/admin/users');
  });

  it('User状態変更APIと認証を維持する', async () => {
    const response = await app.fetch(
      new Request('http://example.com/api/v1/admin/users/1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_live_active: false }),
      }),
      env
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
    });
  });
});

describe('通知配信の実行経路', () => {
  it('HTTP経由のschedule/runを公開しない', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/notifications/schedule/run', {
        method: 'POST',
      }),
      env
    );

    expect(res.status).toBe(404);
  });
});

describe('通知予定管理APIの廃止', () => {
  it.each([
    ['GET', '/api/v1/notification-schedules'],
    ['GET', '/api/v1/notification-schedules/1'],
    ['POST', '/api/v1/notification-schedules'],
    ['DELETE', '/api/v1/notification-schedules/1'],
    ['PUT', '/api/v1/notification/schedules/1'],
  ])(
    '認証の有無にかかわらず旧APIを公開しない（%s %s）',
    async (method, path) => {
      for (const headers of [{}, await bearerHeaders()]) {
        const response = await app.fetch(
          new Request(`http://example.com${path}`, { method, headers }),
          authEnv
        );
        expect(response.status).toBe(404);
      }
    }
  );

  it('API概要で廃止した通知予定管理APIを案内しない', async () => {
    const response = await app.fetch(new Request('http://example.com/'), env);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      endpoints: Record<string, string>;
    };
    expect(body.endpoints).not.toHaveProperty('schedules');
    expect(body.endpoints).not.toHaveProperty('notificationSchedules');
    expect(body.endpoints).toMatchObject({
      adminNotifications: '/api/v1/admin/notifications',
      myNotifications: '/api/v1/me/notifications',
    });
  });

  it.each([
    ['GET', '/api/v1/admin/notifications'],
    ['POST', '/api/v1/admin/notifications'],
    ['GET', '/api/v1/admin/notifications/1'],
    ['PUT', '/api/v1/admin/notifications/1'],
    ['DELETE', '/api/v1/admin/notifications/1'],
    ['GET', '/api/v1/me/notifications'],
    ['GET', '/api/v1/me/notifications/1'],
  ])('利用中の通知APIと認証を維持する（%s %s）', async (method, path) => {
    const response = await app.fetch(
      new Request(`http://example.com${path}`, { method }),
      env
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
    });
  });
});

describe('旧Event操作APIの廃止', () => {
  it.each([
    ['PATCH', '/api/v1/events/1'],
    ['PUT', '/api/v1/events/1/schedule'],
    ['GET', '/api/v1/events/1/notification-summary'],
  ])('削除した旧APIを公開しない（%s %s）', async (method, path) => {
    const res = await app.fetch(
      new Request(`http://example.com${path}`, {
        method,
        headers: await bearerHeaders(),
      }),
      authEnv
    );

    expect(res.status).toBe(404);
  });

  it('維持対象のPUT /api/v1/events/1は未認証時に401になる', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/events/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
    });
  });
});

describe('集合APIの実ルーティング', () => {
  it.each([
    ['POST', '/api/v1/gatherings'],
    ['DELETE', '/api/v1/gatherings/1'],
  ])('旧Gathering Write APIを公開しない（%s %s）', async (method, path) => {
    for (const headers of [{}, await bearerHeaders()]) {
      const res = await app.fetch(
        new Request(`http://example.com${path}`, {
          method,
          headers: { ...headers, 'Content-Type': 'application/json' },
          ...(method === 'POST' && {
            body: JSON.stringify({ eventId: 1, gatheringSpotId: 1 }),
          }),
        }),
        authEnv
      );

      expect(res.status).toBe(404);
    }
  });

  it('Event単位の集合設定保存APIは公開されているが認証が必要', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/events/1/gatherings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rounds: [] }),
      }),
      env
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
    });
  });

  it.each([
    ['GET', '/api/v1/gathering-groups'],
    ['POST', '/api/v1/gathering-groups'],
    ['GET', '/api/v1/gathering-groups/1/members'],
    ['POST', '/api/v1/gathering-groups/1/members'],
    ['DELETE', '/api/v1/gathering-groups/1/members/1'],
  ])('旧gathering-groups APIを公開しない（%s %s）', async (method, path) => {
    const res = await app.fetch(
      new Request(`http://example.com${path}`, { method }),
      env
    );

    expect(res.status).toBe(404);
  });

  it.each(['GET', 'PUT'])(
    '集合ID配下のメンバー%s APIは公開されているが認証が必要',
    async method => {
      const res = await app.fetch(
        new Request('http://example.com/api/v1/gatherings/999999/members', {
          method,
        }),
        env
      );

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
      });
    }
  );

  it.each([
    ['POST', '/api/v1/gatherings/1/members'],
    ['DELETE', '/api/v1/gatherings/1/members/1'],
  ])(
    '旧Gathering Members個別更新APIを公開しない（%s %s）',
    async (method, path) => {
      for (const headers of [{}, await bearerHeaders()]) {
        const res = await app.fetch(
          new Request(`http://example.com${path}`, {
            method,
            headers: { ...headers, 'Content-Type': 'application/json' },
            ...(method === 'POST' && {
              body: JSON.stringify({ userId: 1 }),
            }),
          }),
          authEnv
        );

        expect(res.status).toBe(404);
      }
    }
  );

  it('競技ID配下の集合一覧APIは公開されているが認証が必要', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/events/999999/gatherings'),
      env
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
    });
  });
});

describe('CORS middleware', () => {
  it('ALLOWED_ORIGINS に含まれるオリジンには Access-Control-Allow-Origin を付与する', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        headers: { Origin: 'http://localhost:5173' },
      }),
      corsTestEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:5173'
    );
  });

  it('Cloudflare Pages の本番オリジンを許可する', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        headers: { Origin: 'https://recwatch.pages.dev' },
      }),
      corsTestEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://recwatch.pages.dev'
    );
  });

  it('Cloudflare Pages の preview オリジンを許可する', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        headers: { Origin: 'https://feature-branch.recwatch.pages.dev' },
      }),
      corsTestEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://feature-branch.recwatch.pages.dev'
    );
  });

  it('ALLOWED_ORIGINS に含まれないオリジンには Access-Control-Allow-Origin を付与しない', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        headers: { Origin: 'https://evil.example.com' },
      }),
      corsTestEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('Cloudflare Pages に似た不正なオリジンは許可しない', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        headers: { Origin: 'https://recwatch.pages.dev.evil.example.com' },
      }),
      corsTestEnv
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('OPTIONS プリフライトリクエストに正しいヘッダーを返す', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      }),
      corsTestEnv
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:5173'
    );
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('credentials: true のため Access-Control-Allow-Credentials が付与される', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        headers: { Origin: 'http://localhost:5173' },
      }),
      corsTestEnv
    );
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
