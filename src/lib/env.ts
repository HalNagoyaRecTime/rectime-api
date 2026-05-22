import { D1Database } from '@cloudflare/workers-types';

export type Env = {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  TEST_FCM_TOKEN: string;
};
