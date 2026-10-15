import {
  normalizeFirebaseConfig,
  validateFirebaseConfig,
  importFirebasePrivateKey,
  type FirebaseConfig,
} from './FcmConfiguration';
import {
  IFcmService,
  FcmNotificationInput,
  FcmNotificationResult,
  FcmRequestError,
} from '../../application/services/IFcmService';
import type { FirebasePlatformName } from '../../domain/entities/FirebaseToken';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3600;
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type CachedAccessToken = {
  value: string;
  refreshAt: number;
};

type AccessTokenCacheEntry = {
  token: CachedAccessToken | null;
  request: Promise<CachedAccessToken> | null;
};

const accessTokenCache = new Map<string, AccessTokenCacheEntry>();

export function createFcmService(input: FirebaseConfig): IFcmService & {
  ensureConfigured(): Promise<void>;
} {
  const config = normalizeFirebaseConfig(input);
  let configurationCheck: Promise<void> | undefined;
  const ensureConfigured = () =>
    (configurationCheck ??= validateFirebaseConfig(config));
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
    await ensureConfigured();

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
            ...(input.data ? { data: input.data } : {}),
            ...buildPlatformConfig(input.platform, input.importance),
          },
        }),
      }
    );

    const responseBody = await response.json();

    if (!response.ok) {
      const fcmErrorCode = extractFcmErrorCode(responseBody);
      throw new FcmRequestError(
        response.status,
        fcmErrorCode,
        `FCM request failed: HTTP ${response.status}${
          fcmErrorCode ? ` ${fcmErrorCode}` : ''
        }`
      );
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

  return {
    sendNotificationToToken,
    ensureConfigured,
  };
}

function buildPlatformConfig(
  platform: FirebasePlatformName | undefined,
  importance = 2
): Record<string, unknown> {
  if (platform === 'ios') {
    const interruptionLevel =
      IOS_INTERRUPTION_LEVEL_BY_IMPORTANCE[importance] ?? 'active';
    return {
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            sound: 'default',
            'interruption-level': interruptionLevel,
          },
        },
      },
    };
  }

  return {};
}

/** 保存時の制約で重要度は1〜4。段階ごとの表示レベルを明示的に対応付ける。 */
const IOS_INTERRUPTION_LEVEL_BY_IMPORTANCE: Record<number, string> = {
  1: 'passive',
  2: 'active',
  3: 'time-sensitive',
  4: 'time-sensitive',
};

function extractFcmErrorCode(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== 'object') return null;
  if (!('error' in responseBody)) return null;

  const error = responseBody.error;
  if (!error || typeof error !== 'object') return null;

  if ('details' in error && Array.isArray(error.details)) {
    for (const detail of error.details) {
      if (
        detail &&
        typeof detail === 'object' &&
        'errorCode' in detail &&
        typeof detail.errorCode === 'string'
      ) {
        return detail.errorCode;
      }
    }
  }

  return 'status' in error && typeof error.status === 'string'
    ? error.status
    : null;
}

function getAccessTokenCacheEntry(cacheKey: string): AccessTokenCacheEntry {
  const existing = accessTokenCache.get(cacheKey);
  if (existing) return existing;

  const created = { token: null, request: null };
  accessTokenCache.set(cacheKey, created);
  return created;
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
  const privateKey = await importFirebasePrivateKey(options.privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  return `${unsignedToken}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
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
