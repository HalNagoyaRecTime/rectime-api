import type { Context } from 'hono';

export function resolveCorsOrigin(
  origin: string,
  c: Context
): string | undefined {
  const allowedOrigins = parseAllowedOrigins(c.env.CORS_ALLOWED_ORIGINS);

  if (allowedOrigins.length === 0) {
    return undefined;
  }

  return allowedOrigins.includes(origin) ? origin : undefined;
}

function parseAllowedOrigins(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}
