import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildMicrosoftAuthorizeUrl,
  exchangeMicrosoftToken,
  refreshMicrosoftAccessToken,
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

    expect(result).toEqual({ access_token: 'access-1', id_token: 'id-1' });

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

  it('レスポンスが not ok の場合は null を返す', async () => {
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

    expect(result).toBeNull();
  });

  it('レスポンスボディがJSONとしてパースできない場合も null を返す', async () => {
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

    expect(result).toBeNull();
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

    expect(result).toEqual({ access_token: 'access-1' });

    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-token-1');
    expect(body.get('scope')).toBe(MICROSOFT_SCOPES);
  });
});
