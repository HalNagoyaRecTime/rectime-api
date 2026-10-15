/** サービスアカウントJSONから取り出す通知配信用の設定。 */
export const FCM_SETTING_NAMES = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
] as const;

export type FirebaseConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

export function normalizeFirebaseConfig(
  config: FirebaseConfig
): FirebaseConfig {
  return {
    projectId: (config.projectId ?? '').trim(),
    clientEmail: (config.clientEmail ?? '').trim(),
    privateKey: (config.privateKey ?? '').replace(/\\n/g, '\n').trim(),
  };
}

/** 値そのものをエラーへ含めず、不足した設定名だけを通知する。 */
export async function validateFirebaseConfig(
  config: FirebaseConfig
): Promise<void> {
  const missing = FCM_SETTING_NAMES.filter(
    (_, index) =>
      ![config.projectId, config.clientEmail, config.privateKey][index]
  );
  if (missing.length > 0) {
    throw new Error(`Missing Cloudflare Secrets: ${missing.join(', ')}`);
  }
  if (/\s/.test(config.projectId))
    throw new Error('Invalid Cloudflare Secret: FIREBASE_PROJECT_ID');
  if (!/^[^@\s]+@[^@\s]+$/.test(config.clientEmail))
    throw new Error('Invalid Cloudflare Secret: FIREBASE_CLIENT_EMAIL');
  try {
    await importFirebasePrivateKey(config.privateKey);
  } catch {
    throw new Error('Invalid Cloudflare Secret: FIREBASE_PRIVATE_KEY');
  }
}

export async function importFirebasePrivateKey(
  privateKey: string
): Promise<CryptoKey> {
  const normalized = privateKey.replace(/\\n/g, '\n').trim();
  if (
    !normalized.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !normalized.endsWith('-----END PRIVATE KEY-----')
  ) {
    throw new Error('秘密鍵はPKCS#8のPEM形式で指定してください');
  }
  const contents = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(contents), value => value.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
