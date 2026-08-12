import type {
  D1Database,
  DurableObjectNamespace,
  KVNamespace,
  Queue,
} from '@cloudflare/workers-types';
import type { MasterImportCommitLock } from '../infrastructure/masterImports/MasterImportCommitLock';
import type { NotificationDeliveryMessage } from '../domain/entities/NotificationDelivery';

export type Env = {
  DB: D1Database;
  AUTH_KV: KVNamespace;
  MASTER_IMPORT_COMMIT_LOCK: DurableObjectNamespace<MasterImportCommitLock>;
  NOTIFICATION_DELIVERY_QUEUE: Queue<NotificationDeliveryMessage>;
  ALLOWED_ORIGINS?: string;
  EVENT_DATE?: string;
  /**
   * "true" のときだけ /openapi.json と /docs を公開する。
   * 未設定なら非公開。API仕様・内部エラーコード・DB形状のヒントが
   * 無認証で読めてしまうため、本番では意図的に設定しない。
   */
  DOCS_ENABLED?: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  TEST_FCM_TOKEN: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_PRIVATE_KEY: string;
  MICROSOFT_CERT_THUMBPRINT: string;
  MICROSOFT_TENANT: string;
  ALLOWED_MICROSOFT_TENANTS: string;
  MICROSOFT_MOBILE_REDIRECT_URI: string;
  FRONTEND_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_SEC: string;
  MOBILE_REFRESH_EXPIRES_SEC: string;
};

/** OpenAPI仕様（/openapi.json・/docs）を公開してよい環境か。 */
export function isDocsEnabled(env: Env): boolean {
  return (env.DOCS_ENABLED ?? '').trim().toLowerCase() === 'true';
}
