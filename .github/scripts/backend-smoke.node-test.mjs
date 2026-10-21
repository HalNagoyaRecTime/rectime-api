import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBackendSmoke } from './backend-smoke.mjs';

const origin = 'https://api.example.test';
const reply = (body, status = 200) =>
  new globalThis.Response(JSON.stringify(body), { status });
const success = async (url, options) => {
  if (url.endsWith('/health')) return reply({ status: 'ok' });
  if (!options.headers.Authorization)
    return reply({ error: { code: 'UNAUTHORIZED' } }, 401);
  if (options.headers.Authorization === 'Bearer invalid-smoke-test-token') {
    return reply({ error: { code: 'INVALID_TOKEN' } }, 401);
  }
  return reply({ privateUserData: '非公開テスト値' });
};

test('Tokenなしの成功はpartialで、認証済みAPI成功とは扱わない', async () => {
  const calls = [];
  const report = await runBackendSmoke(origin, {
    request: async (...args) => {
      calls.push(args);
      return success(...args);
    },
  });
  assert.equal(report.result, 'partial');
  assert.equal(report.authenticated, 'not_run');
  assert.equal(report.passed, true);
  assert.equal(calls.length, 3);
  for (const [, options] of calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-Client-Type'], 'mobile');
    assert.ok(options.signal);
  }
});

test('認証済みAPIの200を確認し、Tokenと本文は結果へ含めない', async () => {
  const calls = [];
  const report = await runBackendSmoke(origin, {
    token: 'private-access-token',
    request: async (...args) => {
      calls.push(args);
      return success(...args);
    },
  });
  assert.equal(report.result, 'passed');
  assert.equal(report.checks.length, 7);
  assert.equal(
    calls.filter(
      ([, options]) =>
        options.headers.Authorization === 'Bearer private-access-token'
    ).length,
    4
  );
  assert.ok(!JSON.stringify(report).includes('private-access-token'));
  assert.ok(!JSON.stringify(report).includes('非公開テスト値'));
});

for (const [name, request] of [
  ['healthの200でも内容が不正', async () => reply({ status: 'broken' })],
  ['HTML応答', async () => new globalThis.Response('<html>error</html>')],
  [
    '認証必須APIが500',
    async url =>
      url.endsWith('/health') ? reply({ status: 'ok' }) : reply({}, 500),
  ],
  ['認証が無条件で200', async () => reply({ status: 'ok' })],
  [
    '通信失敗',
    async () => {
      throw new Error('private-token');
    },
  ],
]) {
  test(`${name}は失敗として記録する`, async () => {
    const report = await runBackendSmoke(origin, { request });
    assert.equal(report.result, 'failed');
    assert.equal(report.passed, false);
    assert.ok(!JSON.stringify(report).includes('private-token'));
  });
}

test('公開チェックが成功しても、認証済みAPIが401なら失敗する', async () => {
  const report = await runBackendSmoke(origin, {
    token: 'expired-token',
    request: async (url, options) =>
      options.headers.Authorization === 'Bearer expired-token'
        ? reply({ error: { code: 'SESSION_EXPIRED' } }, 401)
        : success(url, options),
  });
  assert.equal(report.result, 'failed');
  assert.equal(report.checks.filter(check => !check.passed).length, 4);
});

for (const invalid of [
  'https://user:password@example.test',
  'https://api.example.test/path',
  'https://api.example.test?token=private',
  'http://remote.example.test',
  undefined,
]) {
  test('不正なoriginは通信前に拒否する', async () => {
    let called = false;
    await assert.rejects(
      runBackendSmoke(invalid, {
        request: async () => {
          called = true;
        },
      })
    );
    assert.equal(called, false);
  });
}
