import { describe, expect, it, vi } from 'vitest';
import { createScheduledNotificationService } from '../../../src/application/services/ScheduledNotificationService';
import type { IFcmService } from '../../../src/application/services/IFcmService';
import type { DueNotificationSchedule } from '../../../src/domain/entities/NotificationSchedule';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';
import type { INotificationDeliveryQueue } from '../../../src/domain/interfaces/queues/INotificationDeliveryQueue';

function buildSchedule(
  overrides: Partial<DueNotificationSchedule> = {}
): DueNotificationSchedule {
  return {
    notification_schedule_id: 1,
    created_user_id: 7,
    event_id: 2,
    notification_id: 4,
    firebase_token_id: 9,
    fcm_token: 'token-a',
    is_firebase_active: 1,
    notification_type: 'event_reminder',
    title: '集合のお知らせ',
    body: '集合時刻です。',
    importance: 2,
    send_status: 'sending',
    fcm_message_id: null,
    failed_reason: null,
    send_at: '2026-01-01T09:00:00.000Z',
    created_at: '2026-01-01T08:00:00.000Z',
    updated_at: '2026-01-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('ScheduledNotificationService', () => {
  function setup(options?: {
    candidateIds?: number[];
    schedules?: DueNotificationSchedule[];
  }) {
    const notificationScheduleRepository: INotificationScheduleRepository = {
      create: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      deleteDraft: vi.fn(),
      findDraftsByEvent: vi.fn(),
      existsFirebaseToken: vi.fn(),
      existsEvent: vi.fn(),
      existsNotification: vi.fn(),
      findDeliveryCandidateIds: vi
        .fn()
        .mockResolvedValue(options?.candidateIds ?? []),
      claimForDelivery: vi.fn().mockResolvedValue(options?.schedules ?? []),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const firebaseTokenRepository: IFirebaseTokenRepository = {
      register: vi.fn(),
      findActiveTokens: vi.fn(),
      deactivate: vi.fn(),
    };
    const notificationDeliveryQueue: INotificationDeliveryQueue = {
      enqueueMany: vi.fn(),
    };
    const fcmService: IFcmService = {
      sendTestNotification: vi.fn(),
      sendNotificationToToken: vi
        .fn()
        .mockResolvedValue({ success: true, messageId: 'message-1' }),
    };
    return {
      service: createScheduledNotificationService({
        notificationScheduleRepository,
        firebaseTokenRepository,
        notificationDeliveryQueue,
        fcmService,
      }),
      notificationScheduleRepository,
      firebaseTokenRepository,
      notificationDeliveryQueue,
      fcmService,
    };
  }

  it('2200件を15件以下のQueue messageへ分割する', async () => {
    const candidateIds = Array.from({ length: 2200 }, (_, index) => index + 1);
    const {
      service,
      notificationScheduleRepository,
      notificationDeliveryQueue,
    } = setup({ candidateIds });

    const result = await service.enqueueDueNotifications(
      new Date('2026-07-23T09:00:00.000Z')
    );

    expect(result).toEqual({
      queuedSchedules: 2200,
      queuedMessages: 147,
    });
    expect(
      notificationScheduleRepository.findDeliveryCandidateIds
    ).toHaveBeenCalledWith(
      '2026-07-23T09:00:00.000Z',
      '2026-07-23T08:56:00.000Z',
      5000
    );
    const messages = vi.mocked(notificationDeliveryQueue.enqueueMany).mock
      .calls[0][0];
    expect(messages).toHaveLength(147);
    expect(
      messages.every(
        message =>
          message.notificationScheduleIds.length > 0 &&
          message.notificationScheduleIds.length <= 15
      )
    ).toBe(true);
    expect(
      messages.flatMap(message => message.notificationScheduleIds)
    ).toEqual(candidateIds);
  });

  it('対象がない場合はQueueへ書き込まない', async () => {
    const { service, notificationDeliveryQueue } = setup();

    await expect(service.enqueueDueNotifications()).resolves.toEqual({
      queuedSchedules: 0,
      queuedMessages: 0,
    });
    expect(notificationDeliveryQueue.enqueueMany).not.toHaveBeenCalled();
  });

  it('Queueで確保した予定を対応する端末へ送信してsentにする', async () => {
    const { service, notificationScheduleRepository, fcmService } = setup({
      schedules: [buildSchedule()],
    });

    const result = await service.sendQueuedNotifications(
      [1],
      new Date('2026-01-01T09:00:00.000Z')
    );

    expect(
      notificationScheduleRepository.claimForDelivery
    ).toHaveBeenCalledWith(
      [1],
      '2026-01-01T09:00:00.000Z',
      '2026-01-01T08:56:00.000Z'
    );
    expect(fcmService.sendNotificationToToken).toHaveBeenCalledWith({
      token: 'token-a',
      title: '集合のお知らせ',
      body: '集合時刻です。',
      data: {
        type: 'event_reminder',
        eventId: '2',
      },
    });
    expect(notificationScheduleRepository.markSent).toHaveBeenCalledWith(
      1,
      'message-1'
    );
    expect(result).toEqual({ checkedEvents: 1, sent: 1, failed: 0 });
  });

  it('1件が失敗しても同じmessageの残りを続けて送信する', async () => {
    const schedules = [
      buildSchedule({
        notification_schedule_id: 1,
        firebase_token_id: 9,
        fcm_token: 'token-a',
      }),
      buildSchedule({
        notification_schedule_id: 2,
        firebase_token_id: 10,
        fcm_token: 'token-b',
      }),
      buildSchedule({
        notification_schedule_id: 3,
        firebase_token_id: 11,
        fcm_token: 'token-c',
      }),
    ];
    const {
      service,
      notificationScheduleRepository,
      firebaseTokenRepository,
      fcmService,
    } = setup({ schedules });
    vi.mocked(fcmService.sendNotificationToToken)
      .mockResolvedValueOnce({ success: true, messageId: 'message-1' })
      .mockRejectedValueOnce(new Error('UNREGISTERED'))
      .mockResolvedValueOnce({ success: true, messageId: 'message-3' });

    const result = await service.sendQueuedNotifications([1, 2, 3]);

    expect(fcmService.sendNotificationToToken).toHaveBeenCalledTimes(3);
    expect(firebaseTokenRepository.deactivate).toHaveBeenCalledWith(10);
    expect(notificationScheduleRepository.markFailed).toHaveBeenCalledWith(
      2,
      'UNREGISTERED'
    );
    expect(result).toEqual({ checkedEvents: 3, sent: 2, failed: 1 });
  });

  it('無効化済みtokenは送らず予定をfailedにする', async () => {
    const { service, notificationScheduleRepository, fcmService } = setup({
      schedules: [buildSchedule({ is_firebase_active: 0 })],
    });

    const result = await service.sendQueuedNotifications([1]);

    expect(fcmService.sendNotificationToToken).not.toHaveBeenCalled();
    expect(notificationScheduleRepository.markFailed).toHaveBeenCalledWith(
      1,
      'Firebase token is inactive'
    );
    expect(result).toEqual({ checkedEvents: 1, sent: 0, failed: 1 });
  });

  it('重複した予定IDは1回だけclaimする', async () => {
    const { service, notificationScheduleRepository } = setup();

    await service.sendQueuedNotifications([1, 1, 2]);

    expect(
      notificationScheduleRepository.claimForDelivery
    ).toHaveBeenCalledWith([1, 2], expect.any(String), expect.any(String));
  });

  it('状態保存に失敗した場合はQueue再試行のためrejectする', async () => {
    const { service, notificationScheduleRepository } = setup({
      schedules: [buildSchedule()],
    });
    vi.mocked(notificationScheduleRepository.markSent).mockRejectedValueOnce(
      new Error('D1 unavailable')
    );

    await expect(service.sendQueuedNotifications([1])).rejects.toThrow(
      'D1 unavailable'
    );
  });
});
