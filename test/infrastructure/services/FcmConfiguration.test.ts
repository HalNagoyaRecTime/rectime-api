import { beforeAll, describe, expect, it } from 'vitest';
import {
  normalizeFirebaseConfig,
  validateFirebaseConfig,
} from '../../../src/infrastructure/services/FcmConfiguration';

let privateKey: string;
beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const bytes = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer
  );
  privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes))}\n-----END PRIVATE KEY-----`;
});

const config = () => ({
  projectId: 'test-project',
  clientEmail: 'sender@test-project.iam.gserviceaccount.com',
  privateKey,
});
describe('FCM設定の検証', () => {
  it.each([false, true])(
    '実改行とエスケープ改行の秘密鍵を受理する: %s',
    async escaped => {
      const value = config();
      value.privateKey = escaped
        ? privateKey.replace(/\n/g, '\\n')
        : privateKey;
      await expect(
        validateFirebaseConfig(normalizeFirebaseConfig(value))
      ).resolves.toBeUndefined();
    }
  );
  it('空白だけの設定を不足として扱い、値はエラーに出さない', async () => {
    await expect(
      validateFirebaseConfig(
        normalizeFirebaseConfig({ ...config(), clientEmail: '   ' })
      )
    ).rejects.toThrow('Missing Cloudflare Secrets: FIREBASE_CLIENT_EMAIL');
  });
  it.each([
    'invalid-key',
    '{"private_key":"secret"}',
    '"-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----"',
  ])('秘密鍵の形式不正を送信前に拒否する: %s', async value => {
    await expect(
      validateFirebaseConfig(
        normalizeFirebaseConfig({ ...config(), privateKey: value })
      )
    ).rejects.toThrow('Invalid Cloudflare Secret: FIREBASE_PRIVATE_KEY');
  });
  it('JSON全体をメール欄へ入れた誤設定を拒否する', async () => {
    await expect(
      validateFirebaseConfig(
        normalizeFirebaseConfig({
          ...config(),
          clientEmail: '{"client_email":"secret"}',
        })
      )
    ).rejects.toThrow('Invalid Cloudflare Secret: FIREBASE_CLIENT_EMAIL');
  });
  it.each([
    'sample/project',
    'sample project',
    'Sample-project',
    '1sample-project',
    'sample-',
    'short',
    `${'a'.repeat(29)}-`,
  ])('Google Cloud Project IDの形式不正を拒否する: %s', async projectId => {
    await expect(
      validateFirebaseConfig(
        normalizeFirebaseConfig({ ...config(), projectId })
      )
    ).rejects.toThrow('Invalid Cloudflare Secret: FIREBASE_PROJECT_ID');
  });
  it.each(['a1234b', `${'a'.repeat(29)}1`])(
    'Google Cloud Project IDの有効な境界を受理する: %s',
    async projectId => {
      await expect(
        validateFirebaseConfig(
          normalizeFirebaseConfig({ ...config(), projectId })
        )
      ).resolves.toBeUndefined();
    }
  );
});
