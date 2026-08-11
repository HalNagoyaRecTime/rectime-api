import type { Context } from 'hono';
import type { Env as Bindings } from '../../lib/env';
import { base64URLtoBytes } from '../../infrastructure/auth/base64url';
import {
  BASE64_URL_PATTERN,
  ACCOUNT_PHOTO_PATH,
} from '../../domain/auth/types';
import type { AppUser, UserCategories } from '../../domain/auth/types';
import type { IdTokenClaims } from '../../infrastructure/auth/verifyIdToken';
import {
  buildMicrosoftAuthorizeUrl as infraBuildAuthorizeUrl,
  exchangeMicrosoftToken as infraExchangeToken,
  refreshMicrosoftAccessToken as infraRefreshToken,
} from '../../infrastructure/auth/microsoftClient';
import { createUserRepository } from '../../infrastructure/repositories/UserRepository';
import { createAuthService } from '../../application/services/authService';

export type AppContext = Context<{ Bindings: Bindings }>;

export function errorResponse(
  c: AppContext,
  status: 400 | 401 | 404 | 500,
  code: string,
  message: string
): Response {
  return c.json({ error: { code, message } }, status);
}

export function getClientType(c: AppContext): 'web' | 'mobile' | null {
  const value = c.req.header('X-Client-Type') ?? 'web';
  if (value === 'web' || value === 'mobile') return value;
  return null;
}

export function getNumberEnv(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getBearerToken(c: AppContext): string | null {
  const authorization = c.req.header('Authorization');
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  return match?.[1] ?? null;
}

export function isValidBase64Url(value: string): boolean {
  return BASE64_URL_PATTERN.test(value);
}

export function hasMinimumDecodedBytes(
  value: string,
  byteLength: number
): boolean {
  try {
    return base64URLtoBytes(value).byteLength >= byteLength;
  } catch {
    return false;
  }
}

export function userResponse(
  user: {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string | null;
    avatar_updated_at?: string | null;
  },
  categories: UserCategories
) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url ?? ACCOUNT_PHOTO_PATH,
    avatar_updated_at: user.avatar_updated_at ?? null,
    is_student: categories.is_student,
    is_staff: categories.is_staff,
    is_teacher: categories.is_teacher,
  };
}

// web向けMicrosoft OAuthのredirect_uriを、環境ごとの固定secretではなく
// 実際のリクエストURLから動的に組み立てる。production/development/preview
// のいずれであっても、そのWorker自身の実際のオリジンに対して常に正しい
// callback URLになるため、環境ごとに別値のsecretを管理する必要がなくなる。
// (Microsoft Entra側には、実際に使われる各オリジンのcallback URLを
// redirect URIとして事前に登録しておく必要がある)
export function buildWebRedirectUri(c: AppContext): string {
  return `${new URL(c.req.url).origin}/api/v1/auth/microsoft/callback`;
}

export function buildMicrosoftAuthorizeUrl(
  c: AppContext,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  nonce: string
): string {
  return infraBuildAuthorizeUrl(
    c.env.MICROSOFT_CLIENT_ID,
    c.env.MICROSOFT_TENANT,
    redirectUri,
    state,
    codeChallenge,
    nonce
  );
}

export async function exchangeMicrosoftToken(
  c: AppContext,
  params: Record<string, string>,
  options?: { includeClientAssertion?: boolean }
) {
  return infraExchangeToken(
    c.env.MICROSOFT_CLIENT_ID,
    c.env.MICROSOFT_TENANT,
    c.env.MICROSOFT_CLIENT_PRIVATE_KEY,
    c.env.MICROSOFT_CERT_THUMBPRINT,
    params,
    options
  );
}

export async function refreshMicrosoftAccessToken(
  c: AppContext,
  refreshToken: string,
  options?: { includeClientAssertion?: boolean }
) {
  return infraRefreshToken(
    c.env.MICROSOFT_CLIENT_ID,
    c.env.MICROSOFT_TENANT,
    c.env.MICROSOFT_CLIENT_PRIVATE_KEY,
    c.env.MICROSOFT_CERT_THUMBPRINT,
    refreshToken,
    options
  );
}

export async function upsertUser(
  c: AppContext,
  claims: IdTokenClaims
): Promise<AppUser> {
  const userRepository = createUserRepository(c.env.DB);
  const authService = createAuthService(userRepository);
  return authService.upsertUser(claims);
}

export async function getUserCategories(
  c: AppContext,
  userId: string
): Promise<UserCategories> {
  const userRepository = createUserRepository(c.env.DB);
  return userRepository.getUserCategories(Number(userId));
}
