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
    const document = (await res.json()) as { paths: Record<string, unknown> };
    expect(document.paths).toHaveProperty('/api/v1/students');
    expect(document.paths).toHaveProperty('/api/v1/notification-schedules');
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
