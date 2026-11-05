import { describe, expect, it, vi } from 'vitest';
import { createNotificationDeliveryService } from '../../../src/application/services/NotificationDeliveryService';
import { createFcmService } from '../../../src/infrastructure/services/FcmService';
import type { INotificationDeliveryRepository } from '../../../src/domain/interfaces/repositories/INotificationDeliveryRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

function setup(customEnsureConfigured?: () => Promise<void>) {
  let configured = false;
  const calls = new Map<string, ReturnType<typeof vi.fn>>();
  const emptyLists = new Set([
    'findReadySchedules',
    'findDeliveryCandidateIds',
    'claimPendingDeliveries',
  ]);
  const repository = new Proxy(
    {},
    {
      get: (_, key: string) => {
        if (!calls.has(key))
          calls.set(
            key,
            vi.fn().mockResolvedValue(emptyLists.has(key) ? [] : 0)
          );
        return calls.get(key);
      },
    }
  );
  const shared = {
    firebaseTokenRepository: repository as IFirebaseTokenRepository,
    notificationDeliveryQueue: {
      enqueueMany: vi.fn().mockResolvedValue(undefined),
    },
    fcmService: { sendNotificationToToken: vi.fn() },
    ensureConfigured:
      customEnsureConfigured ??
      (async () => {
        if (!configured)
          throw new Error('Missing Cloudflare Secrets: FIREBASE_PRIVATE_KEY');
      }),
  };
  return {
    delivery: createNotificationDeliveryService({
      ...shared,
      notificationDeliveryRepository:
        repository as INotificationDeliveryRepository,
    }),
    calls,
    recover: () => {
      configured = true;
    },
  };
}

describe('通知設定不備時の配信保留', () => {
  it('準備とclaimの前に停止し、設定修正後は同じ処理を再開できる', async () => {
    const { delivery, calls, recover } = setup();
    await expect(delivery.enqueueReadySchedules()).rejects.toThrow(
      'FIREBASE_PRIVATE_KEY'
    );
    await expect(delivery.sendQueuedNotifications([1])).rejects.toThrow(
      'FIREBASE_PRIVATE_KEY'
    );
    expect(
      [...calls.values()].every(call => call.mock.calls.length === 0)
    ).toBe(true);
    recover();
    await delivery.enqueueReadySchedules();
    await delivery.sendQueuedNotifications([1]);
    expect(calls.get('claimPendingDeliveries')).toHaveBeenCalledOnce();
    expect(calls.get('markFailed')).toBeUndefined();
  });

  it('不正なproject IDは配信claimの前に拒否する', async () => {
    const fcmService = createFcmService({
      projectId: 'sample/project',
      clientEmail: 'sender@sample-project.iam.gserviceaccount.com',
      privateKey:
        '-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----',
    });
    const { delivery, calls } = setup(fcmService.ensureConfigured);

    await expect(delivery.sendQueuedNotifications([1])).rejects.toThrow(
      'Invalid Cloudflare Secret: FIREBASE_PROJECT_ID'
    );
    expect(calls.size).toBe(0);
  });

  it('invalid_grantは配信claim前に検知して未送信行を保留する', async () => {
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
    const privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes))}\n-----END PRIVATE KEY-----`;
    const fcmService = createFcmService({
      projectId: 'sample-project',
      clientEmail: 'sender@sample-project.iam.gserviceaccount.com',
      privateKey,
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { delivery, calls } = setup(fcmService.ensureConfigured);

    await expect(delivery.sendQueuedNotifications([1])).rejects.toThrow(
      'invalid_grant'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls.size).toBe(0);
  });
});
