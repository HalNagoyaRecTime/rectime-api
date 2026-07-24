import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  errorResponse,
  getBearerToken,
  getClientType,
  getNumberEnv,
  hasMinimumDecodedBytes,
  isValidBase64Url,
  userResponse,
  type AppContext,
} from '../../../src/presentation/auth/helpers';
import { toBase64URL } from '../../../src/infrastructure/auth/base64url';
import { ACCOUNT_PHOTO_PATH } from '../../../src/domain/auth/types';

function buildApp(
  handler: (c: AppContext) => Response,
  env: Record<string, string> = {}
) {
  const app = new Hono();
  app.all('/*', c => handler(c as unknown as AppContext));
  return { app, env };
}

describe('presentation/auth/helpers', () => {
  describe('errorResponse', () => {
    it('指定した status と { error: { code, message } } の body を返す', async () => {
      const { app, env } = buildApp(c =>
        errorResponse(c, 400, 'BAD_REQUEST', 'invalid input')
      );

      const res = await app.request('/', {}, env);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: 'BAD_REQUEST', message: 'invalid input' },
      });
    });
  });

  describe('getClientType', () => {
    it('X-Client-Type ヘッダーが無い場合は web を返す', async () => {
      const { app, env } = buildApp(c => c.json({ value: getClientType(c) }));

      const res = await app.request('/', {}, env);

      expect(await res.json()).toEqual({ value: 'web' });
    });

    it('X-Client-Type: mobile の場合は mobile を返す', async () => {
      const { app, env } = buildApp(c => c.json({ value: getClientType(c) }));

      const res = await app.request(
        '/',
        { headers: { 'X-Client-Type': 'mobile' } },
        env
      );

      expect(await res.json()).toEqual({ value: 'mobile' });
    });

    it('不正な値の場合は null を返す', async () => {
      const { app, env } = buildApp(c => c.json({ value: getClientType(c) }));

      const res = await app.request(
        '/',
        { headers: { 'X-Client-Type': 'desktop' } },
        env
      );

      expect(await res.json()).toEqual({ value: null });
    });
  });

  describe('getNumberEnv', () => {
    it('有効な数値文字列を数値に変換する', () => {
      expect(getNumberEnv('120', 60)).toBe(120);
    });

    it('undefined の場合は fallback を返す', () => {
      expect(getNumberEnv(undefined, 60)).toBe(60);
    });

    it('数値でない文字列の場合は fallback を返す', () => {
      expect(getNumberEnv('abc', 60)).toBe(60);
    });

    it('0 以下の場合は fallback を返す', () => {
      expect(getNumberEnv('0', 60)).toBe(60);
      expect(getNumberEnv('-10', 60)).toBe(60);
    });
  });

  describe('getBearerToken', () => {
    it('Authorization: Bearer <token> からトークンを取り出す', async () => {
      const { app, env } = buildApp(c => c.json({ value: getBearerToken(c) }));

      const res = await app.request(
        '/',
        { headers: { Authorization: 'Bearer abc.def.ghi' } },
        env
      );

      expect(await res.json()).toEqual({ value: 'abc.def.ghi' });
    });

    it('Authorization ヘッダーが無い場合は null を返す', async () => {
      const { app, env } = buildApp(c => c.json({ value: getBearerToken(c) }));

      const res = await app.request('/', {}, env);

      expect(await res.json()).toEqual({ value: null });
    });

    it('Bearer 形式でない場合は null を返す', async () => {
      const { app, env } = buildApp(c => c.json({ value: getBearerToken(c) }));

      const res = await app.request(
        '/',
        { headers: { Authorization: 'Basic abc123' } },
        env
      );

      expect(await res.json()).toEqual({ value: null });
    });
  });

  describe('isValidBase64Url', () => {
    it('base64url 文字のみの場合は true を返す', () => {
      expect(isValidBase64Url('abcXYZ012_-')).toBe(true);
    });

    it('base64url に含まれない文字がある場合は false を返す', () => {
      expect(isValidBase64Url('abc+def/')).toBe(false);
      expect(isValidBase64Url('abc def')).toBe(false);
    });
  });

  describe('hasMinimumDecodedBytes', () => {
    it('デコード後のバイト長が指定以上の場合は true を返す', () => {
      const encoded = toBase64URL(new Uint8Array(32));

      expect(hasMinimumDecodedBytes(encoded, 32)).toBe(true);
    });

    it('デコード後のバイト長が指定未満の場合は false を返す', () => {
      const encoded = toBase64URL(new Uint8Array(10));

      expect(hasMinimumDecodedBytes(encoded, 32)).toBe(false);
    });

    it('デコードできない値の場合は false を返す', () => {
      expect(hasMinimumDecodedBytes('!!!invalid!!!', 1)).toBe(false);
    });
  });

  describe('userResponse', () => {
    it('avatar_url / avatar_updated_at が無い場合はデフォルト値を補完する', () => {
      const result = userResponse({
        id: 'user-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
      });

      expect(result).toEqual({
        id: 'user-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        avatar_url: ACCOUNT_PHOTO_PATH,
        avatar_updated_at: null,
      });
    });

    it('avatar_url / avatar_updated_at が指定されている場合はそのまま使う', () => {
      const result = userResponse({
        id: 'user-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        avatar_url: 'https://example.com/avatar.png',
        avatar_updated_at: '2026-01-01T00:00:00.000Z',
      });

      expect(result).toEqual({
        id: 'user-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        avatar_url: 'https://example.com/avatar.png',
        avatar_updated_at: '2026-01-01T00:00:00.000Z',
      });
    });
  });
});
