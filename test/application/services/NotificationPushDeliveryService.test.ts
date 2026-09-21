import { describe, expect, it, vi } from 'vitest';
import type { IFcmService } from '../../../src/application/services/IFcmService';
import { createNotificationPushDeliveryService } from '../../../src/application/services/NotificationPushDeliveryService';
import type { INotificationPushDeliveryRepository } from '../../../src/domain/interfaces/repositories/INotificationPushDeliveryRepository';

function buildTarget() {
  return {
    deliveryId: 10,
    scheduleId: 20,
    notificationId: 30,
    eventId: 40,
    notificationType: 'event_reminder',
    title: '集合のお知らせ',
    body: '集合してください',
    importance: 2,
    firebaseTokenId: 50,
    fcmToken: 'fcm-token',
    platform: 1 as const,
    attemptCount: 1,
  };
}

function setup() {
  const repository: INotificationPushDeliveryRepository = {
    isDeliveryGenerationAllowed: vi.fn().mockResolvedValue(true),
    createPendingDeliveries: vi.fn().mockResolvedValue(3),
    findPendingDeliveryIds: vi.fn(),
    markScheduleSending: vi.fn().mockResolvedValue(true),
    claimPendingDelivery: vi.fn().mockResolvedValue(buildTarget()),
    markDeliverySent: vi.fn().mockResolvedValue(true),
    markDeliveryFailed: vi.fn().mockResolvedValue(true),
    completeScheduleIfIdle: vi.fn().mockResolvedValue(true),
    markScheduleFailed: vi.fn().mockResolvedValue(true),
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
    service: createNotificationPushDeliveryService({
      repository,
      fcmService,
    }),
  };
}

describe('NotificationPushDeliveryService', () => {
  it('Recipient確定済みScheduleからDeliveryを生成してsendingへ進める', async () => {
    const { repository, service } = setup();

    await expect(
      service.generateDeliveries(20, new Date('2026-09-21T09:00:00.000Z'))
    ).resolves.toEqual({
      status: 'generated',
      createdCount: 3,
    });
    expect(repository.createPendingDeliveries).toHaveBeenCalledWith(20);
    expect(repository.markScheduleSending).toHaveBeenCalledWith(
      20,
      '2026-09-21T09:00:00.000Z'
    );
  });

  it('生成済みScheduleの再実行ではTokenをbackfillしない', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.isDeliveryGenerationAllowed).mockResolvedValue(false);

    await expect(service.generateDeliveries(20)).resolves.toEqual({
      status: 'skipped',
      createdCount: 0,
    });
    expect(repository.createPendingDeliveries).not.toHaveBeenCalled();
    expect(repository.markScheduleSending).not.toHaveBeenCalled();
  });

  it('DeliveryをclaimしてiOS payloadをFCMへ送りsentと完了を保存する', async () => {
    const { repository, fcmService, service } = setup();

    await expect(
      service.sendDelivery(10, new Date('2026-09-21T09:00:00.000Z'))
    ).resolves.toEqual({
      status: 'sent',
      scheduleCompleted: true,
    });
    expect(repository.claimPendingDelivery).toHaveBeenCalledWith(
      10,
      '2026-09-21T09:00:00.000Z'
    );
    expect(fcmService.sendNotificationToToken).toHaveBeenCalledWith({
      token: 'fcm-token',
      platform: 'ios',
      title: '集合のお知らせ',
      body: '集合してください',
      importance: 2,
      data: { type: 'event_reminder', eventId: '40' },
    });
    expect(repository.markDeliverySent).toHaveBeenCalledWith(
      10,
      'message-1',
      '2026-09-21T09:00:00.000Z'
    );
    expect(repository.completeScheduleIfIdle).toHaveBeenCalledWith(
      20,
      '2026-09-21T09:00:00.000Z'
    );
  });

  it('FCM失敗はDeliveryだけをfailedにしretry_waitへ遷移しない', async () => {
    const { repository, fcmService, service } = setup();
    vi.mocked(fcmService.sendNotificationToToken).mockRejectedValueOnce(
      new Error('FCM unavailable')
    );

    await expect(service.sendDelivery(10)).resolves.toEqual({
      status: 'failed',
      scheduleCompleted: true,
    });
    expect(repository.markDeliveryFailed).toHaveBeenCalledWith(
      10,
      'FCM unavailable',
      expect.any(String)
    );
    expect(repository.markDeliverySent).not.toHaveBeenCalled();
    expect(repository.markScheduleFailed).not.toHaveBeenCalled();
  });

  it('別Workerが先にclaimしたDeliveryはFCM送信しない', async () => {
    const { repository, fcmService, service } = setup();
    vi.mocked(repository.claimPendingDelivery).mockResolvedValue(null);

    await expect(service.sendDelivery(10)).resolves.toEqual({
      status: 'skipped',
      scheduleCompleted: false,
    });
    expect(fcmService.sendNotificationToToken).not.toHaveBeenCalled();
  });

  it('Delivery生成の継続不能時だけScheduleをfailedにする', async () => {
    const { repository, service } = setup();
    vi.mocked(repository.createPendingDeliveries).mockRejectedValueOnce(
      new Error('D1 unavailable')
    );

    await expect(service.generateDeliveries(20)).rejects.toThrow(
      'D1 unavailable'
    );
    expect(repository.markScheduleFailed).toHaveBeenCalledWith(
      20,
      'D1 unavailable',
      expect.any(String)
    );
  });
});
