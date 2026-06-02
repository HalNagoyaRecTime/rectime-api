import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export type Bindings = {
  DB: D1Database;
  AUTH_KV: KVNamespace;
  ALLOWED_ORIGINS: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  MICROSOFT_TENANT: string;
  ALLOWED_MICROSOFT_TENANTS?: string;
  MICROSOFT_REDIRECT_URI: string;
  MICROSOFT_MOBILE_REDIRECT_URI: string;
  FRONTEND_URL: string;
  SESSION_EXPIRES_SEC: string;
  JWT_SECRET: string;
  JWT_EXPIRES_SEC: string;
  MOBILE_REFRESH_EXPIRES_SEC: string;
};
