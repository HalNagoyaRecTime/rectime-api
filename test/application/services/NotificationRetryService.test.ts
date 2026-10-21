import { describe, expect, it } from 'vitest';
import {
  createNotificationRetryService,
  classifyFcmError,
} from '../../../src/application/services/NotificationRetryService';
import {
  FcmConfigurationError,
  FcmRequestError,
} from '../../../src/application/services/IFcmService';
import { parseRetryAfter } from '../../../src/infrastructure/services/FcmService';
import type { INotificationDeliveryRepository } from '../../../src/domain/interfaces/repositories/INotificationDeliveryRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import type { INotificationDeliveryQueue } from '../../../src/domain/interfaces/queues/INotificationDeliveryQueue';
import { vi } from 'vitest';

describe('FCM error分類', () => {
  it.each(['INVALID_ARGUMENT', 'SENDER_ID_MISMATCH'])(
    '%sを恒久失敗にする',
    code => {
      expect(classifyFcmError(new FcmRequestError(400, code, '失敗'))).toBe(
        'permanent'
      );
    }
  );
  it.each(['INTERNAL', 'UNAVAILABLE', 'QUOTA_EXCEEDED'])(
    '%sを再送する',
    code => {
      expect(classifyFcmError(new FcmRequestError(503, code, '失敗'))).toBe(
        'temporary'
      );
    }
  );
  it('UNREGISTEREDだけToken削除とし、文字列からToken削除を推測しない', () => {
    expect(
      classifyFcmError(new FcmRequestError(404, 'UNREGISTERED', '失敗'))
    ).toBe('unregistered');
    expect(classifyFcmError(new Error('invalid token'))).toBe('temporary');
    expect(classifyFcmError(new FcmRequestError(401, null, '認証失敗'))).toBe(
      'configuration'
    );
    expect(
      classifyFcmError(
        new FcmRequestError(403, 'PERMISSION_DENIED', '権限設定を確認')
      )
    ).toBe('configuration');
    expect(
      classifyFcmError(
        new FcmRequestError(401, 'THIRD_PARTY_AUTH_ERROR', 'APNs設定なし')
      )
    ).toBe('configuration');
    expect(classifyFcmError(new FcmConfigurationError('OAuth失敗'))).toBe(
      'configuration'
    );
  });
  it('Retry-Afterの秒数・HTTP日付・不正値を処理する', () => {
    expect(parseRetryAfter('90')).toBe(90);
    expect(
      parseRetryAfter(
        'Sat, 03 Oct 2026 00:01:30 GMT',
        Date.parse('2026-10-03T00:00:00Z')
      )
    ).toBe(90);
    expect(parseRetryAfter('-1')).toBeNull();
    expect(parseRetryAfter('不正')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});

describe('通知再送の設定ゲート', () => {
  it('設定不備時はretry対象のclaim・終了処理を行わない', async () => {
    const calls = new Map<string, ReturnType<typeof vi.fn>>();
    const repository = new Proxy(
      {},
      {
        get: (_, key: string) => {
          if (!calls.has(key))
            calls.set(
              key,
              vi
                .fn()
                .mockResolvedValue(key === 'findDueRetryDeliveryIds' ? [] : [])
            );
          return calls.get(key);
        },
      }
    ) as INotificationDeliveryRepository;
    const ensureConfigured = vi
      .fn()
      .mockRejectedValue(new Error('invalid_grant'));
    const queue: INotificationDeliveryQueue = {
      enqueueMany: vi.fn(),
    };
    const service = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: {} as IFirebaseTokenRepository,
      fcmService: { sendNotificationToToken: vi.fn() },
      notificationDeliveryQueue: queue,
      ensureConfigured,
    });

    await expect(service.enqueueDueDeliveries()).rejects.toThrow(
      'invalid_grant'
    );
    await expect(service.retryDueDeliveries()).rejects.toThrow('invalid_grant');

    expect(ensureConfigured).toHaveBeenCalledTimes(2);
    expect(calls.size).toBe(0);
    expect(queue.enqueueMany).not.toHaveBeenCalled();
  });
});
