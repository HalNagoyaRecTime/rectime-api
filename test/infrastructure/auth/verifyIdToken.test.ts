import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import { verifyIdToken } from '../../../src/infrastructure/auth/verifyIdToken';
import type { IdTokenClaims } from '../../../src/infrastructure/auth/verifyIdToken';
import { toBase64URL } from '../../../src/infrastructure/auth/base64url';

const KID = 'test-kid';
const CLIENT_ID = 'client-1';
const NONCE = 'nonce-1';
const TENANT = 'tenant-1';

let keyPair: CryptoKeyPair;
let jwk: JsonWebKey & { kid: string };
let otherKeyPair: CryptoKeyPair;

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const exportedJwk = (await crypto.subtle.exportKey(
    'jwk',
    keyPair.publicKey
  )) as JsonWebKey;
  jwk = { ...exportedJwk, kid: KID };

  otherKeyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
});

function createMockKv(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string, type?: string) => {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === 'json') return JSON.parse(value);
      return value;
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as KVNamespace;
}

function buildClaims(overrides: Partial<IdTokenClaims> = {}): IdTokenClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'sub-1',
    oid: 'oid-1',
    tid: TENANT,
    name: '田中太郎',
    nonce: NONCE,
    iss: `https://login.microsoftonline.com/${TENANT}/v2.0`,
    aud: CLIENT_ID,
    exp: now + 3600,
    iat: now - 10,
    ...overrides,
  };
}

async function signToken(
  claims: IdTokenClaims,
  options: {
    kid?: string;
    alg?: string;
    signingKey?: CryptoKey;
    tamperSignature?: boolean;
  } = {}
): Promise<string> {
  const header = {
    alg: options.alg ?? 'RS256',
    typ: 'JWT',
    kid: options.kid ?? KID,
  };
  const headerB64 = toBase64URL(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadB64 = toBase64URL(
    new TextEncoder().encode(JSON.stringify(claims))
  );
  const data = `${headerB64}.${payloadB64}`;
  const signingKey = options.signingKey ?? keyPair.privateKey;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(data)
  );
  let signatureB64 = toBase64URL(new Uint8Array(signature));
  if (options.tamperSignature) {
    signatureB64 =
      signatureB64.slice(0, -1) + (signatureB64.endsWith('a') ? 'b' : 'a');
  }
  return `${data}.${signatureB64}`;
}

function stubJwksFetch(keys: unknown[] = [jwk]) {
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify({ keys }), { status: 200 })
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyIdToken', () => {
  it('有効なトークンの場合は payload を返す', async () => {
    stubJwksFetch();
    const kv = createMockKv();
    const claims = buildClaims();
    const token = await signToken(claims);

    const result = await verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT);

    expect(result).toMatchObject(claims);
  });

  it('ドット区切りが3つでない場合は INVALID_ID_TOKEN を投げる', async () => {
    const kv = createMockKv();

    await expect(
      verifyIdToken('not.valid', kv, CLIENT_ID, NONCE, TENANT)
    ).rejects.toThrow('INVALID_ID_TOKEN');
  });

  it('alg が RS256 でない場合は INVALID_ID_TOKEN を投げる', async () => {
    stubJwksFetch();
    const kv = createMockKv();
    const claims = buildClaims();
    const token = await signToken(claims, { alg: 'HS256' });

    await expect(
      verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
    ).rejects.toThrow('INVALID_ID_TOKEN');
  });

  it('署名が不正な場合は INVALID_ID_TOKEN を投げる', async () => {
    stubJwksFetch();
    const kv = createMockKv();
    const claims = buildClaims();
    const token = await signToken(claims, {
      signingKey: otherKeyPair.privateKey,
    });

    await expect(
      verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
    ).rejects.toThrow('INVALID_ID_TOKEN');
  });

  it('有効期限切れの場合は INVALID_ID_TOKEN を投げる', async () => {
    stubJwksFetch();
    const kv = createMockKv();
    const now = Math.floor(Date.now() / 1000);
    const claims = buildClaims({ exp: now - 1000 });
    const token = await signToken(claims);

    await expect(
      verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
    ).rejects.toThrow('INVALID_ID_TOKEN');
  });

  it('iat が未来すぎる場合は INVALID_ID_TOKEN を投げる', async () => {
    stubJwksFetch();
    const kv = createMockKv();
    const now = Math.floor(Date.now() / 1000);
    const claims = buildClaims({ iat: now + 1000 });
    const token = await signToken(claims);

    await expect(
      verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
    ).rejects.toThrow('INVALID_ID_TOKEN');
  });

  it('aud が一致しない場合は INVALID_ID_TOKEN を投げる', async () => {
    stubJwksFetch();
    const kv = createMockKv();
    const claims = buildClaims({ aud: 'other-client' });
    const token = await signToken(claims);

    await expect(
      verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
    ).rejects.toThrow('INVALID_ID_TOKEN');
  });

  it('nonce が一致しない場合は INVALID_ID_TOKEN を投げる', async () => {
    stubJwksFetch();
    const kv = createMockKv();
    const claims = buildClaims({ nonce: 'wrong-nonce' });
    const token = await signToken(claims);

    await expect(
      verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
    ).rejects.toThrow('INVALID_ID_TOKEN');
  });

  describe('テナント検証', () => {
    it('allowedMicrosoftTenants が設定されている場合、tid がリストに含まれ iss がそのテナントに一致すれば成功する', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims({
        tid: 'tenant-a',
        iss: 'https://login.microsoftonline.com/tenant-a/v2.0',
      });
      const token = await signToken(claims);

      const result = await verifyIdToken(
        token,
        kv,
        CLIENT_ID,
        NONCE,
        TENANT,
        'tenant-a,tenant-b'
      );

      expect(result).toMatchObject(claims);
    });

    it('allowedMicrosoftTenants が設定されているが tid がリストに無い場合は INVALID_ID_TOKEN を投げる', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims({
        tid: 'tenant-c',
        iss: 'https://login.microsoftonline.com/tenant-c/v2.0',
      });
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT, 'tenant-a,tenant-b')
      ).rejects.toThrow('INVALID_ID_TOKEN');
    });

    it('allowedMicrosoftTenants が設定されているが iss が tid のテナントと一致しない場合は INVALID_ID_TOKEN を投げる', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims({
        tid: 'tenant-a',
        iss: 'https://login.microsoftonline.com/tenant-other/v2.0',
      });
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT, 'tenant-a,tenant-b')
      ).rejects.toThrow('INVALID_ID_TOKEN');
    });

    it('allowedMicrosoftTenants が無く microsoftTenant が common の場合は常に INVALID_ID_TOKEN を投げる', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims({
        tid: 'any-tenant',
        iss: 'https://login.microsoftonline.com/any-tenant/v2.0',
      });
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, 'common')
      ).rejects.toThrow('INVALID_ID_TOKEN');
    });

    it('allowedMicrosoftTenants が無く microsoftTenant が organizations の場合は常に INVALID_ID_TOKEN を投げる', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims({
        tid: 'any-tenant',
        iss: 'https://login.microsoftonline.com/any-tenant/v2.0',
      });
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, 'organizations')
      ).rejects.toThrow('INVALID_ID_TOKEN');
    });

    it('allowedMicrosoftTenants が無く microsoftTenant が空文字の場合は常に INVALID_ID_TOKEN を投げる', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims({
        tid: 'any-tenant',
        iss: 'https://login.microsoftonline.com/any-tenant/v2.0',
      });
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, '')
      ).rejects.toThrow('INVALID_ID_TOKEN');
    });

    it('allowedMicrosoftTenants が無く、tid が指定テナントと一致し iss も一致する場合は成功する', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims();
      const token = await signToken(claims);

      const result = await verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT);

      expect(result).toMatchObject(claims);
    });

    it('allowedMicrosoftTenants が無く、tid が指定テナントと一致しない場合は INVALID_ID_TOKEN を投げる', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims({
        tid: 'other-tenant',
        iss: 'https://login.microsoftonline.com/other-tenant/v2.0',
      });
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
      ).rejects.toThrow('INVALID_ID_TOKEN');
    });

    it('allowedMicrosoftTenants が無く、tid は一致するが iss が一致しない場合は INVALID_ID_TOKEN を投げる', async () => {
      stubJwksFetch();
      const kv = createMockKv();
      const claims = buildClaims({
        tid: TENANT,
        iss: 'https://login.microsoftonline.com/different-issuer/v2.0',
      });
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
      ).rejects.toThrow('INVALID_ID_TOKEN');
    });
  });

  describe('JWKS キャッシュ', () => {
    it('KV にキャッシュがある場合は fetch を呼ばずに検証する', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const kv = createMockKv({
        jwks_cache: JSON.stringify({ keys: [jwk] }),
      });
      const claims = buildClaims();
      const token = await signToken(claims);

      const result = await verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT);

      expect(result).toMatchObject(claims);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('kid がキャッシュに無い場合はキャッシュを削除し再取得する', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(
          async () =>
            new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
        );
      vi.stubGlobal('fetch', fetchMock);
      const kv = createMockKv({
        jwks_cache: JSON.stringify({ keys: [] }),
      });
      const claims = buildClaims();
      const token = await signToken(claims);

      const result = await verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT);

      expect(result).toMatchObject(claims);
      expect(kv.delete).toHaveBeenCalledWith('jwks_cache');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('再取得後も kid が見つからない場合は INVALID_ID_TOKEN を投げる', async () => {
      stubJwksFetch([]);
      const kv = createMockKv();
      const claims = buildClaims();
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
      ).rejects.toThrow('INVALID_ID_TOKEN');
    });

    it('JWKS の取得に失敗した場合は JWKS_FETCH_FAILED を投げる', async () => {
      const fetchMock = vi
        .fn()
        .mockImplementation(async () => new Response('error', { status: 500 }));
      vi.stubGlobal('fetch', fetchMock);
      const kv = createMockKv();
      const claims = buildClaims();
      const token = await signToken(claims);

      await expect(
        verifyIdToken(token, kv, CLIENT_ID, NONCE, TENANT)
      ).rejects.toThrow('JWKS_FETCH_FAILED');
    });
  });
});
