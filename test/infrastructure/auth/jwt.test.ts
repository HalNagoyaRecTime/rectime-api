import { describe, expect, it } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  type AccessTokenClaims,
} from '../../../src/infrastructure/auth/jwt';

const SECRET = 'a'.repeat(32);

function buildPayload(
  clientType: AccessTokenClaims['client_type'] = 'mobile'
): Omit<AccessTokenClaims, 'iat' | 'exp'> {
  return {
    sub: 'sub-1',
    oid: 'oid-1',
    email: 'tanaka@example.com',
    display_name: '田中太郎',
    client_type: clientType,
  };
}

describe('jwt', () => {
  describe('signAccessToken / verifyAccessToken', () => {
    it('署名したトークンを検証でき、payload が一致する', async () => {
      const token = await signAccessToken(buildPayload(), SECRET, 3600);

      const claims = await verifyAccessToken(token, SECRET, 'mobile');

      expect(claims).toMatchObject(buildPayload());
      expect(claims.exp - claims.iat).toBe(3600);
    });

    it('client_type が web のトークンも同様に署名・検証できる', async () => {
      const token = await signAccessToken(buildPayload('web'), SECRET, 3600);

      const claims = await verifyAccessToken(token, SECRET, 'web');

      expect(claims).toMatchObject(buildPayload('web'));
    });

    it('シークレットが32バイト未満の場合は MISCONFIGURED_JWT_SECRET を投げる', async () => {
      await expect(
        signAccessToken(buildPayload(), 'short-secret', 3600)
      ).rejects.toThrow('MISCONFIGURED_JWT_SECRET');
    });

    it('異なるシークレットで検証すると INVALID_TOKEN を投げる', async () => {
      const token = await signAccessToken(buildPayload(), SECRET, 3600);

      await expect(
        verifyAccessToken(token, 'b'.repeat(32), 'mobile')
      ).rejects.toThrow('INVALID_TOKEN');
    });

    it('署名部分が改ざんされている場合は INVALID_TOKEN を投げる', async () => {
      const token = await signAccessToken(buildPayload(), SECRET, 3600);
      const [header, payload] = token.split('.');
      const tampered = `${header}.${payload}.tampered-signature`;

      await expect(
        verifyAccessToken(tampered, SECRET, 'mobile')
      ).rejects.toThrow('INVALID_TOKEN');
    });

    it('ドット区切りが3つでない場合は INVALID_TOKEN を投げる', async () => {
      await expect(
        verifyAccessToken('not.a.valid.jwt', SECRET, 'mobile')
      ).rejects.toThrow('INVALID_TOKEN');
      await expect(
        verifyAccessToken('onlyone', SECRET, 'mobile')
      ).rejects.toThrow('INVALID_TOKEN');
    });

    it('有効期限切れの場合は SESSION_EXPIRED を投げる', async () => {
      const token = await signAccessToken(buildPayload(), SECRET, -10);

      await expect(verifyAccessToken(token, SECRET, 'mobile')).rejects.toThrow(
        'SESSION_EXPIRED'
      );
    });

    it('client_type が期待値と異なる場合は INVALID_TOKEN を投げる', async () => {
      const token = await signAccessToken(buildPayload('web'), SECRET, 3600);

      await expect(verifyAccessToken(token, SECRET, 'mobile')).rejects.toThrow(
        'INVALID_TOKEN'
      );
    });
  });
});
