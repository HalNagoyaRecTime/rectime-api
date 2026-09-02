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
      '/api/v1/admin/users',
      '/api/v1/classrooms',
      '/api/v1/classrooms/{classId}',
      '/api/v1/events',
      '/api/v1/events/{eventId}',
      '/api/v1/events/{eventId}/gatherings',
      '/api/v1/events/{eventId}/notification-summary',
      '/api/v1/events/{eventId}/schedule',
      '/api/v1/firebase-tokens',
      '/api/v1/gathering-spots',
      '/api/v1/gathering-spots/{gatheringSpotId}',
      '/api/v1/gatherings',
      '/api/v1/gatherings/{gatheringId}',
      '/api/v1/gatherings/{gatheringId}/members',
      '/api/v1/gatherings/{gatheringId}/members/{userId}',
      '/api/v1/master-imports',
      '/api/v1/master-imports/{validatedFileId}',
      '/api/v1/master-imports/{validatedFileId}/commit',
      '/api/v1/me/notifications',
      '/api/v1/me/notifications/{notificationId}',
      '/api/v1/notification-schedules',
      '/api/v1/notification-schedules/{id}',
      '/api/v1/notification/schedules/{notificationId}',
      '/api/v1/notifications',
      '/api/v1/notifications/test',
      '/api/v1/notifications/{id}',
      '/api/v1/staffs',
      '/api/v1/staffs/{staffId}',
      '/api/v1/students',
      '/api/v1/students/{studentId}',
      '/api/v1/teachers',
      '/api/v1/teachers/{teacherId}',
      '/health',
    ]);
    expect(document.components.schemas.Event.properties?.rule_text).toEqual({
      type: 'string',
      nullable: true,
    });

    const documentedOperations = Object.values(document.paths).flatMap(path =>
      Object.keys(path).filter(method =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(method)
      )
    );
    expect(documentedOperations).toHaveLength(57);
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
    expect(document.paths['/api/v1/admin/users'].get?.security).toEqual([
      { Bearer: [] },
    ]);
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
      error: 'Invalid request',
      code: 'VALIDATION_ERROR',
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

describe('集合APIの実ルーティング', () => {
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

  it('集合ID配下のメンバーAPIは公開されているが認証が必要', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/gatherings/999999/members'),
      env
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
    });
  });

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
