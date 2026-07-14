import { describe, expect, it } from 'vitest';
import {
  signMobileJwt,
  verifyMobileJwt,
  type MobileJwtClaims,
} from '../../../src/infrastructure/auth/jwt';

const SECRET = 'a'.repeat(32);

function buildPayload(): Omit<MobileJwtClaims, 'iat' | 'exp'> {
  return {
    sub: 'sub-1',
    oid: 'oid-1',
    email: 'tanaka@example.com',
    display_name: '田中太郎',
    client_type: 'mobile',
  };
}

describe('jwt', () => {
  describe('signMobileJwt / verifyMobileJwt', () => {
    it('署名したトークンを検証でき、payload が一致する', async () => {
      const token = await signMobileJwt(buildPayload(), SECRET, 3600);

      const claims = await verifyMobileJwt(token, SECRET);

      expect(claims).toMatchObject(buildPayload());
      expect(claims.exp - claims.iat).toBe(3600);
    });

    it('シークレットが32バイト未満の場合は MISCONFIGURED_JWT_SECRET を投げる', async () => {
      await expect(
        signMobileJwt(buildPayload(), 'short-secret', 3600)
      ).rejects.toThrow('MISCONFIGURED_JWT_SECRET');
    });

    it('異なるシークレットで検証すると INVALID_TOKEN を投げる', async () => {
      const token = await signMobileJwt(buildPayload(), SECRET, 3600);

      await expect(verifyMobileJwt(token, 'b'.repeat(32))).rejects.toThrow(
        'INVALID_TOKEN'
      );
    });

    it('署名部分が改ざんされている場合は INVALID_TOKEN を投げる', async () => {
      const token = await signMobileJwt(buildPayload(), SECRET, 3600);
      const [header, payload] = token.split('.');
      const tampered = `${header}.${payload}.tampered-signature`;

      await expect(verifyMobileJwt(tampered, SECRET)).rejects.toThrow(
        'INVALID_TOKEN'
      );
    });

    it('ドット区切りが3つでない場合は INVALID_TOKEN を投げる', async () => {
      await expect(verifyMobileJwt('not.a.valid.jwt', SECRET)).rejects.toThrow(
        'INVALID_TOKEN'
      );
      await expect(verifyMobileJwt('onlyone', SECRET)).rejects.toThrow(
        'INVALID_TOKEN'
      );
    });

    it('有効期限切れの場合は SESSION_EXPIRED を投げる', async () => {
      const token = await signMobileJwt(buildPayload(), SECRET, -10);

      await expect(verifyMobileJwt(token, SECRET)).rejects.toThrow(
        'SESSION_EXPIRED'
      );
    });

    it('client_type が mobile でない場合は INVALID_TOKEN を投げる', async () => {
      const token = await signMobileJwt(
        { ...buildPayload(), client_type: 'web' as 'mobile' },
        SECRET,
        3600
      );

      await expect(verifyMobileJwt(token, SECRET)).rejects.toThrow(
        'INVALID_TOKEN'
      );
    });
  });
});
