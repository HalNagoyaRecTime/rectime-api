import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

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
      };
      paths: Record<string, Record<string, unknown>>;
    };

    expect(Object.keys(document.paths).sort()).toEqual([
      '/',
      '/api/v1/classes',
      '/api/v1/events',
      '/api/v1/events/{eventId}',
      '/api/v1/firebase-tokens',
      '/api/v1/gathering-groups',
      '/api/v1/gathering-groups/{gatheringGroupId}/members',
      '/api/v1/gathering-groups/{gatheringGroupId}/members/{userId}',
      '/api/v1/gathering-spots',
      '/api/v1/gatherings',
      '/api/v1/notification-schedules',
      '/api/v1/notifications/schedule/run',
      '/api/v1/notifications/test',
      '/api/v1/students',
      '/api/v1/students/{studentId}',
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
    expect(documentedOperations).toHaveLength(21);
  });

  it('/docs が /openapi.json を読むSwagger UIを返す', async () => {
    const res = await app.fetch(new Request('http://example.com/docs'), env);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("url: '/openapi.json'");
  });
});

describe('CORS middleware', () => {
  it('ALLOWED_ORIGINS に含まれるオリジンには Access-Control-Allow-Origin を付与する', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        headers: { Origin: 'http://localhost:5173' },
      }),
      env
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:5173'
    );
  });

  it('ALLOWED_ORIGINS に含まれないオリジンには Access-Control-Allow-Origin を付与しない', async () => {
    const res = await app.fetch(
      new Request('http://example.com/health', {
        headers: { Origin: 'https://evil.example.com' },
      }),
      env
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
      env
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
      env
    );
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
