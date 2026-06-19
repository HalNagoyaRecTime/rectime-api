import { D1Database } from '@cloudflare/workers-types';
import type { Env } from './env';

export function getDb(env?: Env): D1Database {
  if (!env?.DB) {
    throw new Error(
      'DB binding not found. Make sure to run with wrangler dev or deploy to Cloudflare Workers.'
    );
  }
  return env.DB;
}
