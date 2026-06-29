import type { Context } from 'hono';
import type { Env as Bindings } from '../lib/env';
import { base64URLtoBytes } from '../infrastructure/auth/base64url';
import { BASE64_URL_PATTERN } from '../domain/auth/types';

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

export function shouldUseSecureCookie(c: AppContext): boolean {
  try {
    return new URL(c.env.MICROSOFT_REDIRECT_URI).protocol === 'https:';
  } catch {
    return true;
  }
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
