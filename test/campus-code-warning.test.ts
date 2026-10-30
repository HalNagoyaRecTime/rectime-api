import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { app } from '../src/index';

function campusWarnings(calls: unknown[][]): unknown[][] {
  return calls.filter(
    ([message]) => typeof message === 'string' && message.startsWith('[CAMPUS]')
  );
}

describe('CAMPUS_CODE の起動時チェック', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('テスト用のwrangler設定(名古屋 development)に学校コードが入っている', () => {
    expect(env.CAMPUS_CODE).toBe('NAGOYA');
  });

  // 警告は1つのWorkerで1回だけ出す作りのため、順番に確認する。
  it('正しい値では警告せず、不正な値では1回だけ警告する', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await app.request('/health', {}, env);
    expect(campusWarnings(warnSpy.mock.calls)).toHaveLength(0);

    await app.request('/health', {}, { ...env, CAMPUS_CODE: 'Osaka' });
    const warnings = campusWarnings(warnSpy.mock.calls);
    expect(warnings).toHaveLength(1);
    expect(warnings[0][0]).toContain('"Osaka"');
    expect(warnings[0][0]).toContain('NAGOYA, OSAKA, TOKYO');

    await app.request('/health', {}, { ...env, CAMPUS_CODE: undefined });
    expect(campusWarnings(warnSpy.mock.calls)).toHaveLength(1);
  });
});
