import {
  IFcmService,
  FcmNotificationInput,
  FcmTestNotificationInput,
  FcmNotificationResult,
} from '../../application/services/IFcmService';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type FirebaseConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  testFcmToken: string;
};

type CachedAccessToken = {
  value: string;
  refreshAt: number;
};

type AccessTokenCacheEntry = {
  token: CachedAccessToken | null;
  request: Promise<CachedAccessToken> | null;
};

const accessTokenCache = new Map<string, AccessTokenCacheEntry>();

export function createFcmService(config: FirebaseConfig): IFcmService {
  const cacheKey = `${config.projectId}:${config.clientEmail}`;

  const getAccessToken = async (): Promise<string> => {
    const cacheEntry = getAccessTokenCacheEntry(cacheKey);

    if (cacheEntry.token && Date.now() < cacheEntry.token.refreshAt) {
      return cacheEntry.token.value;
    }

    if (!cacheEntry.request) {
      cacheEntry.request = createAccessToken(config)
        .then(accessToken => {
          cacheEntry.token = accessToken;
          return accessToken;
        })
        .finally(() => {
          cacheEntry.request = null;
        });
    }

    return (await cacheEntry.request).value;
  };

  const sendNotificationToToken = async (
    input: FcmNotificationInput
  ): Promise<FcmNotificationResult> => {
    validateConfig(config);

    const accessToken = await getAccessToken();
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: input.token,
            notification: {
              title: input.title,
              body: input.body,
            },
            data: input.data ?? {
              type: 'test',
            },
          },
        }),
      }
    );

    const responseBody = await response.json();

    if (!response.ok) {
      throw new Error(`FCM request failed: ${JSON.stringify(responseBody)}`);
    }

    const messageName =
      responseBody &&
      typeof responseBody === 'object' &&
      'name' in responseBody &&
      typeof responseBody.name === 'string'
        ? responseBody.name
        : '';

    return {
      success: true,
      messageId: messageName,
    };
  };

  const sendTestNotification = async (
    input: FcmTestNotificationInput
  ): Promise<FcmNotificationResult> => {
    return sendNotificationToToken({
      token: config.testFcmToken,
      title: input.title,
      body: input.body,
      data: {
        type: 'test',
      },
    });
  };

  return {
    sendTestNotification,
    sendNotificationToToken,
  };
}

function getAccessTokenCacheEntry(cacheKey: string): AccessTokenCacheEntry {
  const existing = accessTokenCache.get(cacheKey);
  if (existing) return existing;

  const created = { token: null, request: null };
  accessTokenCache.set(cacheKey, created);
  return created;
}

function validateConfig(config: FirebaseConfig) {
  const missingKeys = [
    ['FIREBASE_PROJECT_ID', config.projectId],
    ['FIREBASE_CLIENT_EMAIL', config.clientEmail],
    ['FIREBASE_PRIVATE_KEY', config.privateKey],
    ['TEST_FCM_TOKEN', config.testFcmToken],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Cloudflare Secrets: ${missingKeys.join(', ')}`);
  }
}

async function createAccessToken(
  config: FirebaseConfig
): Promise<CachedAccessToken> {
  const issuedAt = Date.now();
  const now = Math.floor(issuedAt / 1000);
  const jwt = await createSignedJwt({
    clientEmail: config.clientEmail,
    privateKey: config.privateKey,
    issuedAt: now,
    expiresAt: now + 3600,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenBody = await response.json();

  if (!response.ok) {
    throw new Error(
      `Google OAuth token request failed: ${JSON.stringify(tokenBody)}`
    );
  }

  if (
    !tokenBody ||
    typeof tokenBody !== 'object' ||
    !('access_token' in tokenBody) ||
    typeof tokenBody.access_token !== 'string'
  ) {
    throw new Error('Google OAuth token response did not include access_token');
  }

  const expiresInSeconds =
    'expires_in' in tokenBody &&
    typeof tokenBody.expires_in === 'number' &&
    Number.isFinite(tokenBody.expires_in) &&
    tokenBody.expires_in > 0
      ? tokenBody.expires_in
      : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;

  return {
    value: tokenBody.access_token,
    refreshAt:
      issuedAt +
      Math.max(0, expiresInSeconds * 1000 - ACCESS_TOKEN_REFRESH_MARGIN_MS),
  };
}

async function createSignedJwt(options: {
  clientEmail: string;
  privateKey: string;
  issuedAt: number;
  expiresAt: number;
}): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    iss: options.clientEmail,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: options.issuedAt,
    exp: options.expiresAt,
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const privateKey = await importPrivateKey(options.privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  return `${unsignedToken}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function importPrivateKey(privateKey: string): Promise<CryptoKey> {
  const normalizedPrivateKey = privateKey.replace(/\\n/g, '\n');
  const pemContents = normalizedPrivateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  return crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(pemContents),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}
