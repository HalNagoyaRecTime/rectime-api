import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFcmService } from '../../../src/infrastructure/services/FcmService';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

let privateKeyPem: string;
let configSequence = 0;

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey(
    'pkcs8',
    keyPair.privateKey
  )) as ArrayBuffer;
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${arrayBufferToBase64(pkcs8)}\n-----END PRIVATE KEY-----`;
});

function buildConfig(overrides: Partial<Record<string, string>> = {}) {
  configSequence += 1;
  return {
    projectId: 'project-1',
    clientEmail: `sa-${configSequence}@project-1.iam.gserviceaccount.com`,
    privateKey: privateKeyPem,
    testFcmToken: 'test-fcm-token',
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FcmService', () => {
  describe('sendNotificationToToken', () => {
    it('成功時は2回 fetch を呼び、messageId を含む結果を返す', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'token-a' }), {
            status: 200,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ name: 'projects/x/messages/1' }), {
            status: 200,
          })
        );
      vi.stubGlobal('fetch', fetchMock);

      const service = createFcmService(buildConfig());
      const result = await service.sendNotificationToToken({
        token: 'device-token',
        title: 'タイトル',
        body: '本文',
      });

      expect(result).toEqual({
        success: true,
        messageId: 'projects/x/messages/1',
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [firstUrl, firstInit] = fetchMock.mock.calls[0];
      expect(firstUrl).toBe('https://oauth2.googleapis.com/token');
      expect(firstInit.method).toBe('POST');

      const [secondUrl, secondInit] = fetchMock.mock.calls[1];
      expect(secondUrl).toBe(
        'https://fcm.googleapis.com/v1/projects/project-1/messages:send'
      );
      expect(secondInit.method).toBe('POST');
      expect(secondInit.headers.Authorization).toBe('Bearer token-a');
      const sentBody = JSON.parse(secondInit.body as string);
      expect(sentBody.message.token).toBe('device-token');
      expect(sentBody.message.notification).toEqual({
        title: 'タイトル',
        body: '本文',
      });
    });

    it('FCM レスポンスに name が無い場合 messageId は空文字になる', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'token-a' }), {
            status: 200,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({}), { status: 200 })
        );
      vi.stubGlobal('fetch', fetchMock);

      const service = createFcmService(buildConfig());
      const result = await service.sendNotificationToToken({
        token: 'device-token',
        title: 'タイトル',
        body: '本文',
      });

      expect(result).toEqual({ success: true, messageId: '' });
    });

    it('FCM リクエストが失敗した場合は FCM request failed エラーを投げる', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'token-a' }), {
            status: 200,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'invalid token' }), {
            status: 400,
          })
        );
      vi.stubGlobal('fetch', fetchMock);

      const service = createFcmService(buildConfig());

      await expect(
        service.sendNotificationToToken({
          token: 'device-token',
          title: 'タイトル',
          body: '本文',
        })
      ).rejects.toThrow('FCM request failed:');
    });

    it('同じService内の並行送信ではGoogle OAuth tokenを1回だけ取得する', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'token-a' }), {
            status: 200,
          })
        )
        .mockImplementation(
          () =>
            new Response(JSON.stringify({ name: 'projects/x/messages/1' }), {
              status: 200,
            })
        );
      vi.stubGlobal('fetch', fetchMock);

      const service = createFcmService(buildConfig());
      await Promise.all([
        service.sendNotificationToToken({
          token: 'device-token-1',
          title: 'タイトル',
          body: '本文',
        }),
        service.sendNotificationToToken({
          token: 'device-token-2',
          title: 'タイトル',
          body: '本文',
        }),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => url === 'https://oauth2.googleapis.com/token'
        )
      ).toHaveLength(1);
    });

    it('異なるService instanceでも同じ設定のGoogle OAuth tokenを共有する', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ access_token: 'token-a', expires_in: 3600 }),
            { status: 200 }
          )
        )
        .mockImplementation(
          () =>
            new Response(JSON.stringify({ name: 'projects/x/messages/1' }), {
              status: 200,
            })
        );
      vi.stubGlobal('fetch', fetchMock);

      const config = buildConfig();
      const firstService = createFcmService(config);
      const secondService = createFcmService(config);

      await Promise.all([
        firstService.sendNotificationToToken({
          token: 'device-token-1',
          title: 'タイトル',
          body: '本文',
        }),
        secondService.sendNotificationToToken({
          token: 'device-token-2',
          title: 'タイトル',
          body: '本文',
        }),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => url === 'https://oauth2.googleapis.com/token'
        )
      ).toHaveLength(1);
    });

    it('Google OAuth tokenの有効期限5分前に新しいtokenを取得する', async () => {
      let currentTime = Date.parse('2026-07-31T00:00:00.000Z');
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

      let tokenRequestCount = 0;
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url === 'https://oauth2.googleapis.com/token') {
          tokenRequestCount += 1;
          return new Response(
            JSON.stringify({
              access_token: `token-${tokenRequestCount}`,
              expires_in: 3600,
            }),
            { status: 200 }
          );
        }

        return new Response(JSON.stringify({ name: 'projects/x/messages/1' }), {
          status: 200,
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const service = createFcmService(buildConfig());
      await service.sendNotificationToToken({
        token: 'device-token-1',
        title: 'タイトル',
        body: '本文',
      });

      currentTime += 54 * 60 * 1000;
      await service.sendNotificationToToken({
        token: 'device-token-2',
        title: 'タイトル',
        body: '本文',
      });

      currentTime += 2 * 60 * 1000;
      await service.sendNotificationToToken({
        token: 'device-token-3',
        title: 'タイトル',
        body: '本文',
      });

      const oauthRequests = fetchMock.mock.calls.filter(
        ([url]) => url === 'https://oauth2.googleapis.com/token'
      );
      expect(oauthRequests).toHaveLength(2);

      const fcmRequests = fetchMock.mock.calls.filter(
        ([url]) =>
          url ===
          'https://fcm.googleapis.com/v1/projects/project-1/messages:send'
      );
      expect(fcmRequests[0][1].headers.Authorization).toBe('Bearer token-1');
      expect(fcmRequests[1][1].headers.Authorization).toBe('Bearer token-1');
      expect(fcmRequests[2][1].headers.Authorization).toBe('Bearer token-2');
    });

    it('Google OAuth トークン取得が失敗した場合は Google OAuth token request failed エラーを投げる', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const service = createFcmService(buildConfig());

      await expect(
        service.sendNotificationToToken({
          token: 'device-token',
          title: 'タイトル',
          body: '本文',
        })
      ).rejects.toThrow('Google OAuth token request failed:');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('Google OAuth レスポンスに access_token が無い場合はエラーを投げる', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ token_type: 'Bearer' }), {
          status: 200,
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const service = createFcmService(buildConfig());

      await expect(
        service.sendNotificationToToken({
          token: 'device-token',
          title: 'タイトル',
          body: '本文',
        })
      ).rejects.toThrow(
        'Google OAuth token response did not include access_token'
      );
    });

    it('設定が不足している場合は Missing Cloudflare Secrets エラーを投げる', async () => {
      const service = createFcmService(
        buildConfig({ projectId: '', clientEmail: '' })
      );

      await expect(
        service.sendNotificationToToken({
          token: 'device-token',
          title: 'タイトル',
          body: '本文',
        })
      ).rejects.toThrow(
        'Missing Cloudflare Secrets: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL'
      );
    });
  });

  describe('sendTestNotification', () => {
    it('config.testFcmToken 宛に data: { type: "test" } を付けて送信する', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'token-a' }), {
            status: 200,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ name: 'projects/x/messages/2' }), {
            status: 200,
          })
        );
      vi.stubGlobal('fetch', fetchMock);

      const service = createFcmService(buildConfig());
      const result = await service.sendTestNotification({
        title: 'テスト',
        body: 'テスト本文',
      });

      expect(result).toEqual({
        success: true,
        messageId: 'projects/x/messages/2',
      });

      const [, secondInit] = fetchMock.mock.calls[1];
      const sentBody = JSON.parse(secondInit.body as string);
      expect(sentBody.message.token).toBe('test-fcm-token');
      expect(sentBody.message.data).toEqual({ type: 'test' });
    });
  });
});
