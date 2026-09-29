import type { AppContext } from './helpers';
import {
  getAllowedOriginRules,
  isAllowedOrigin,
} from '../../lib/allowedOrigins';

// Web認証開始時のRefererからoriginだけを取り出し、CORSと同じ規則で検証する。
export function getAllowedFrontendOrigin(c: AppContext): string | null {
  const referer = c.req.header('Referer');
  if (!referer) {
    return null;
  }

  let origin: string;
  try {
    const refererUrl = new URL(referer);
    if (refererUrl.protocol !== 'http:' && refererUrl.protocol !== 'https:') {
      return null;
    }
    origin = refererUrl.origin;
  } catch {
    return null;
  }

  const allowedOriginRules = getAllowedOriginRules(c.env.ALLOWED_ORIGINS ?? '');
  return isAllowedOrigin(origin, allowedOriginRules) ? origin : null;
}

// callbackではstateを消費せず、検証済みoriginだけを復元する。
export async function getStoredFrontendOrigin(
  c: AppContext,
  state: string | undefined
): Promise<string | null> {
  if (!state) {
    return null;
  }

  try {
    const raw = await c.env.AUTH_KV.get(`pkce:${state}`);
    if (!raw) {
      return null;
    }

    const entry = JSON.parse(raw) as {
      client_type?: unknown;
      frontend_origin?: unknown;
    };
    if (
      entry.client_type !== 'web' ||
      typeof entry.frontend_origin !== 'string'
    ) {
      return null;
    }

    const allowedOriginRules = getAllowedOriginRules(
      c.env.ALLOWED_ORIGINS ?? ''
    );
    return isAllowedOrigin(entry.frontend_origin, allowedOriginRules)
      ? entry.frontend_origin
      : null;
  } catch {
    return null;
  }
}
