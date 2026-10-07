import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildMicrosoftAuthorizeUrl,
  exchangeMicrosoftToken,
  refreshMicrosoftAccessToken,
  MICROSOFT_TOKEN_TIMEOUT_MS,
} from '../../../src/infrastructure/auth/microsoftClient';
import { MICROSOFT_SCOPES } from '../../../src/domain/auth/types';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

let privateKeyPem: string;

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey(
    'pkcs8',
    keyPair.privateKey
  )) as ArrayBuffer;
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${arrayBufferToBase64(pkcs8)}\n-----END PRIVATE KEY-----`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('buildMicrosoftAuthorizeUrl', () => {
  it('必要なクエリパラメータをすべて含む認可URLを組み立てる', () => {
    const url = buildMicrosoftAuthorizeUrl(
      'client-1',
      'tenant-1',
      'https://example.com/callback',
      'state-1',
      'challenge-1',
      'nonce-1'
    );

    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://login.microsoftonline.com');
    expect(parsed.pathname).toBe('/tenant-1/oauth2/v2.0/authorize');

    const params = parsed.searchParams;
    expect(params.get('client_id')).toBe('client-1');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('redirect_uri')).toBe('https://example.com/callback');
    expect(params.get('scope')).toBe(MICROSOFT_SCOPES);
    expect(params.get('state')).toBe('state-1');
    expect(params.get('code_challenge')).toBe('challenge-1');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('nonce')).toBe('nonce-1');
    expect(params.get('response_mode')).toBe('query');
    expect(params.get('prompt')).toBe('select_account');
  });
});

describe('exchangeMicrosoftToken', () => {
  it('成功時はパースしたJSONを返し、client_assertion 系フィールドを含めて送信する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'access-1', id_token: 'id-1' }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await exchangeMicrosoftToken(
      'client-1',
      'tenant-1',
      privateKeyPem,
      'thumbprint-1',
      { grant_type: 'authorization_code', code: 'code-1' }
    );

    expect(result).toEqual({
      ok: true,
      tokens: { access_token: 'access-1', id_token: 'id-1' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token'
    );
    expect(init.method).toBe('POST');

    const body = new URLSearchParams(init.body as string);
    expect(body.get('client_id')).toBe('client-1');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-1');
    expect(body.get('client_assertion')).toEqual(expect.any(String));
    expect(body.get('client_assertion_type')).toBe(
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
    );
  });

  it('options.includeClientAssertion が false の場合は client_assertion 系フィールドを含めない', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'access-1' }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await exchangeMicrosoftToken(
      'client-1',
      'tenant-1',
      privateKeyPem,
      'thumbprint-1',
      { grant_type: 'authorization_code', code: 'code-1' },
      { includeClientAssertion: false }
    );

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.has('client_assertion')).toBe(false);
    expect(body.has('client_assertion_type')).toBe(false);
  });

  it('HTTP 400のinvalid_grantは再認証が必要と返す', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'bad' }),
          { status: 400 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await exchangeMicrosoftToken(
      'client-1',
      'tenant-1',
      privateKeyPem,
      'thumbprint-1',
      { grant_type: 'authorization_code', code: 'code-1' }
    );

    expect(result).toEqual({ ok: false, reason: 'reauthentication_required' });
  });

  it('JSON不正は失効と区別する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not json', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await exchangeMicrosoftToken(
      'client-1',
      'tenant-1',
      privateKeyPem,
      'thumbprint-1',
      { grant_type: 'authorization_code', code: 'code-1' }
    );

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('refreshMicrosoftAccessToken', () => {
  it('grant_type=refresh_token と scope, refresh_token を含めて exchangeMicrosoftToken を呼ぶ', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'access-1' }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await refreshMicrosoftAccessToken(
      'client-1',
      'tenant-1',
      privateKeyPem,
      'thumbprint-1',
      'refresh-token-1'
    );

    expect(result).toEqual({ ok: true, tokens: { access_token: 'access-1' } });

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-token-1');
    expect(body.get('scope')).toBe(MICROSOFT_SCOPES);
  });
});

describe('Microsoftトークン交換の障害分類', () => {
  function exchange() {
    return refreshMicrosoftAccessToken(
      'client',
      'tenant',
      '',
      '',
      'secret-refresh',
      { includeClientAssertion: false }
    );
  }

  it.each([
    [400, 'interaction_required', 'reauthentication_required'],
    [400, 'temporarily_unavailable', 'unavailable'],
    [400, 'invalid_client', 'provider_error'],
    [400, 'invalid_scope', 'provider_error'],
    [400, 'unknown_error', 'provider_error'],
    [400, 'INVALID_GRANT', 'provider_error'],
    [401, 'invalid_grant', 'provider_error'],
    [429, 'invalid_grant', 'unavailable'],
    [500, 'invalid_grant', 'unavailable'],
    [503, 'interaction_required', 'unavailable'],
  ])('HTTP %s / %sは%sに分類する', async (status, error, reason) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error }), { status }))
    );
    expect(await exchange()).toEqual({ ok: false, reason });
  });

  it.each([
    null,
    [],
    {},
    { access_token: 12 },
    { access_token: '' },
    { access_token: ' ' },
    { access_token: 'access', refresh_token: null },
    { access_token: 'access', id_token: false },
    { access_token: 'access', error: 'invalid_grant' },
  ])('不正な成功レスポンス%sも失効にしない', async payload => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
    );
    expect(await exchange()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('通信例外の本文をログに出さず一時障害にする', async () => {
    const warn = vi.spyOn(console, 'warn');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('secret-refresh'))
    );
    expect(await exchange()).toEqual({ ok: false, reason: 'unavailable' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('上流のエラー説明・トークンをログに出さない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'invalid_client',
            error_description: 'secret-refresh',
            access_token: 'secret-access',
          }),
          { status: 400 }
        )
      )
    );
    await exchange();
    expect(warn).toHaveBeenCalledWith(expect.any(String), { status: 400 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-');
  });

  it.each(['接続', '本文'])(
    '%sの待機は10秒で終了し、通信を中断する',
    async phase => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      const fetchMock = vi.fn((_url, init: RequestInit) => {
        signal = init.signal as AbortSignal;
        if (phase === '接続') return new Promise<Response>(() => {});
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => new Promise(() => {}),
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const pending = exchange();
      await vi.advanceTimersByTimeAsync(MICROSOFT_TOKEN_TIMEOUT_MS - 1);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ ok: false, reason: 'unavailable' });
      expect(signal?.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('成功後はタイムアウトを残さない', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ access_token: 'access' }))
        )
    );
    expect((await exchange()).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
