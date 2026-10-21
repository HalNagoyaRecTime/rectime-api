import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

function validateOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BACKEND_SMOKE_BASE_URLにAPIのoriginを指定してください。');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      '接続先はHTTPSのoriginのみ指定できます。ローカル検証だけHTTPを許可します。'
    );
  }
  return url.origin;
}

// 応答本文や認証情報は結果へ含めず、読み取り専用APIだけ確認する。
export async function runBackendSmoke(
  baseUrl,
  { token, request = fetch, timeoutMs = 10000 } = {}
) {
  const origin = validateOrigin(baseUrl);
  const checks = [
    { id: 'health', path: '/health', status: 200, kind: 'health' },
    {
      id: 'unauthenticated',
      path: '/api/v1/auth/me',
      status: 401,
      kind: 'unauthorized',
    },
    {
      id: 'invalid-token',
      path: '/api/v1/auth/me',
      status: 401,
      kind: 'invalid',
      token: 'invalid-smoke-test-token',
    },
  ];
  if (token) {
    for (const path of [
      '/api/v1/auth/me',
      '/api/v1/events',
      '/api/v1/me/events',
      '/api/v1/me/notifications',
    ]) {
      checks.push({ id: `authenticated:${path}`, path, status: 200, token });
    }
  }
  const results = [];
  for (const check of checks) {
    const headers = { Accept: 'application/json', 'X-Client-Type': 'mobile' };
    if (check.token) headers.Authorization = `Bearer ${check.token}`;
    let status = null;
    let passed = false;
    try {
      const response = await request(`${origin}${check.path}`, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      const body = await response.json();
      passed =
        status === check.status && body !== null && typeof body === 'object';
      if (check.kind === 'health') passed &&= body.status === 'ok';
      if (check.kind === 'unauthorized')
        passed &&= body.error?.code === 'UNAUTHORIZED';
      if (check.kind === 'invalid')
        passed &&= body.error?.code === 'INVALID_TOKEN';
    } catch {
      // 例外にはURLや応答が含まれる場合があるため、内容を出力しない。
    }
    results.push({
      id: check.id,
      path: check.path,
      expectedStatus: check.status,
      status,
      passed,
    });
  }
  const passed = results.every(result => result.passed);
  return {
    result: passed ? (token ? 'passed' : 'partial') : 'failed',
    authenticated: token ? 'executed' : 'not_run',
    passed,
    checks: results,
  };
}

async function main() {
  try {
    if (process.argv.length !== 2) throw new Error();
    let token;
    if (process.env.BACKEND_SMOKE_TOKEN_FILE) {
      token = (
        await readFile(process.env.BACKEND_SMOKE_TOKEN_FILE, 'utf8')
      ).trim();
      if (!token || !/^[A-Za-z0-9._~-]+$/.test(token)) throw new Error();
    }
    const report = await runBackendSmoke(process.env.BACKEND_SMOKE_BASE_URL, {
      token,
    });
    console.info(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch {
    console.error(
      'Smoke Testを開始できませんでした。接続先originとTokenファイルの設定を確認してください。'
    );
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
