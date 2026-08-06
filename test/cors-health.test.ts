import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

const corsTestEnv = {
  ...env,
  ALLOWED_ORIGINS:
    'http://localhost:5173,https://recwatch.pages.dev,https://*.recwatch.pages.dev',
};

describe('GET /health', () => {
  it('200 と { status: "ok" } を返す', async () => {
    const res = await app.fetch(new Request('http://example.com/health'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
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
