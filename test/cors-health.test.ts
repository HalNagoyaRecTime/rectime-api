import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

type WorkerFetchHandler = (
  req: Request,
  env: unknown,
  ctx: ExecutionContext
) => Promise<Response>;

const worker = (
  exports as unknown as { default: { fetch: WorkerFetchHandler } }
).default;
const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

function workerFetch(url: string, init?: RequestInit) {
  return worker.fetch(new Request(url, init), env, ctx);
}

describe('GET /health', () => {
  it('200 と { status: "ok" } を返す', async () => {
    const res = await workerFetch('http://example.com/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('CORS middleware', () => {
  it('ALLOWED_ORIGINS に含まれるオリジンには Access-Control-Allow-Origin を付与する', async () => {
    const res = await workerFetch('http://example.com/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:5173'
    );
  });

  it('ALLOWED_ORIGINS に含まれないオリジンには Access-Control-Allow-Origin を付与しない', async () => {
    const res = await workerFetch('http://example.com/health', {
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('OPTIONS プリフライトリクエストに正しいヘッダーを返す', async () => {
    const res = await workerFetch('http://example.com/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:5173'
    );
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('credentials: true のため Access-Control-Allow-Credentials が付与される', async () => {
    const res = await workerFetch('http://example.com/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
