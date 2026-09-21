import { describe, expect, it, vi } from 'vitest';
import { FcmRequestError } from '../../../src/application/services/IFcmService';
import {
  FCM_PROCESSING_TIMEOUT_SECONDS,
  FCM_RETRY_OFFSETS_SECONDS,
  createNotificationRetryService,
} from '../../../src/application/services/NotificationRetryService';
import type { IFcmService } from '../../../src/application/services/IFcmService';
import type { INotificationRetryRepository } from '../../../src/domain/interfaces/repositories/INotificationRetryRepository';

function buildTarget() {
  return {
    deliveryId: 10,
    scheduleId: 20,
    notificationId: 30,
    eventId: null,
    notificationType: 'manual',
    title: '通知',
    body: '本文',
    importance: 2,
    firebaseTokenId: 50,
    fcmToken: 'fcm-token',
    platform: 2 as const,
    attemptCount: 1,
  };
}

function setup() {
  const repository: INotificationRetryRepository = {
    isScheduleStopped: vi.fn().mockResolvedValue(false),
    findRetryableDeliveryIds: vi.fn().mockResolvedValue([]),
    claimRetryableDelivery: vi.fn().mockResolvedValue(buildTarget()),
    findTimedOutDeliveryIds: vi.fn().mockResolvedValue([]),
    claimTimedOutDelivery: vi.fn().mockResolvedValue(buildTarget()),
    scheduleRetry: vi.fn().mockResolvedValue(true),
    markDeliveryFailed: vi.fn().mockResolvedValue(true),
    deleteFirebaseToken: vi.fn(),
    markDeliverySent: vi.fn().mockResolvedValue(true),
    completeScheduleIfIdle: vi.fn().mockResolvedValue(true),
  };
  const fcmService: IFcmService = {
    sendTestNotification: vi.fn(),
    sendNotificationToToken: vi
      .fn()
      .mockResolvedValue({ success: true, messageId: 'message-1' }),
  };
  return {
    repository,
    fcmService,
    service: createNotificationRetryService({ repository, fcmService }),
  };
}

describe('NotificationRetryService', () => {
  it.each(
    FCM_RETRY_OFFSETS_SECONDS.map((offset, index) => ({
      attemptCount: index + 1,
      offset,
    }))
  )(
    '一時エラーをoffset $offset 秒のretry_waitにする',
    async ({ attemptCount, offset }) => {
      const { repository, service } = setup();

      await expect(
        service.handleFcmFailure(
          {
            deliveryId: 10,
            scheduleId: 20,
            firebaseTokenId: 50,
            attemptCount,
            error: new FcmRequestError(503, 'UNAVAILABLE', 'temporary'),
          },
          new Date('2026-09-21T09:00:00.000Z')
        )
      ).resolves.toEqual({
        status: 'retry_wait',
        scheduleCompleted: false,
        tokenDeleted: false,
      });
      expect(repository.scheduleRetry).toHaveBeenCalledWith(
        10,
        new Date(
          Date.parse('2026-09-21T09:00:00.000Z') + offset * 1000
        ).toISOString(),
        'temporary',
        '2026-09-21T09:00:00.000Z'
      );
    }
  );

  it('429はRetry-Afterと最低70秒の大きい方を使う', async () => {
    const { repository, service } = setup();

    await service.handleFcmFailure(
      {
        deliveryId: 10,
        scheduleId: 20,
        firebaseTokenId: 50,
        attemptCount: 1,
        error: new FcmRequestError(429, 'QUOTA_EXCEEDED', 'rate limited', 120),
      },
      new Date('2026-09-21T09:00:00.000Z')
    );

    expect(repository.scheduleRetry).toHaveBeenCalledWith(
      10,
      '2026-09-21T09:02:00.000Z',
      'rate limited',
      '2026-09-21T09:00:00.000Z'
    );
  });

  it('UNREGISTEREDはTokenを物理削除してfailedにする', async () => {
    const { repository, service } = setup();

    await expect(
      service.handleFcmFailure({
        deliveryId: 10,
        scheduleId: 20,
        firebaseTokenId: 50,
        attemptCount: 1,
        error: new FcmRequestError(404, 'UNREGISTERED', 'unregistered'),
      })
    ).resolves.toMatchObject({
      status: 'failed',
      tokenDeleted: true,
    });
    expect(repository.deleteFirebaseToken).toHaveBeenCalledWith(50);
    expect(repository.markDeliveryFailed).toHaveBeenCalledWith(
      10,
      'unregistered',
      expect.any(String)
    );
    expect(repository.scheduleRetry).not.toHaveBeenCalled();
  });

  it('INVALID_ARGUMENTはTokenを削除せずfailedにする', async () => {
    const { repository, service } = setup();

    await expect(
      service.handleFcmFailure({
        deliveryId: 10,
        scheduleId: 20,
        firebaseTokenId: 50,
        attemptCount: 1,
        error: new FcmRequestError(400, 'INVALID_ARGUMENT', 'invalid payload'),
      })
    ).resolves.toMatchObject({ status: 'failed', tokenDeleted: false });
    expect(repository.deleteFirebaseToken).not.toHaveBeenCalled();
    expect(repository.markDeliveryFailed).toHaveBeenCalled();
  });

  it('Retry回数終了後はfailedにする', async () => {
    const { repository, service } = setup();

    await expect(
      service.handleFcmFailure({
        deliveryId: 10,
        scheduleId: 20,
        firebaseTokenId: 50,
        attemptCount: FCM_RETRY_OFFSETS_SECONDS.length + 1,
        error: new FcmRequestError(503, 'UNAVAILABLE', 'temporary'),
      })
    ).resolves.toMatchObject({ status: 'failed' });
    expect(repository.scheduleRetry).not.toHaveBeenCalled();
    expect(repository.markDeliveryFailed).toHaveBeenCalled();
  });

  it('stopped ScheduleではRetryを開始しない', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.isScheduleStopped).mockResolvedValue(true);

    await expect(
      service.handleFcmFailure({
        deliveryId: 10,
        scheduleId: 20,
        firebaseTokenId: 50,
        attemptCount: 1,
        error: new FcmRequestError(503, 'UNAVAILABLE', 'temporary'),
      })
    ).resolves.toEqual({
      status: 'skipped',
      scheduleCompleted: false,
      tokenDeleted: false,
    });
    expect(repository.scheduleRetry).not.toHaveBeenCalled();
    expect(repository.markDeliveryFailed).not.toHaveBeenCalled();
  });

  it('due retryをclaimしてFCM成功結果を保存する', async () => {
    const { repository, fcmService, service } = setup();
    vi.mocked(repository.findRetryableDeliveryIds).mockResolvedValue([10]);

    await expect(
      service.retryDueDeliveries(new Date('2026-09-21T09:00:00.000Z'))
    ).resolves.toEqual({
      checked: 1,
      sent: 1,
      retried: 0,
      failed: 0,
    });
    expect(repository.claimRetryableDelivery).toHaveBeenCalledWith(
      10,
      '2026-09-21T09:00:00.000Z'
    );
    expect(fcmService.sendNotificationToToken).toHaveBeenCalled();
    expect(repository.markDeliverySent).toHaveBeenCalledWith(
      10,
      'message-1',
      '2026-09-21T09:00:00.000Z'
    );
  });

  it('processing timeout回収では120秒前を境界にclaimする', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.findTimedOutDeliveryIds).mockResolvedValue([10]);
    vi.mocked(repository.claimTimedOutDelivery).mockResolvedValue(null);

    await service.recoverProcessingTimeouts(
      new Date('2026-09-21T09:02:00.000Z')
    );

    expect(repository.findTimedOutDeliveryIds).toHaveBeenCalledWith(
      '2026-09-21T09:00:00.000Z',
      100
    );
    expect(repository.claimTimedOutDelivery).toHaveBeenCalledWith(
      10,
      '2026-09-21T09:00:00.000Z',
      '2026-09-21T09:02:00.000Z'
    );
    expect(FCM_PROCESSING_TIMEOUT_SECONDS).toBe(120);
  });
});
