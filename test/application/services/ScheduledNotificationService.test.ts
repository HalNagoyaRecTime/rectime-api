import { describe, expect, it, vi } from 'vitest';
import { createScheduledNotificationService } from '../../../src/application/services/ScheduledNotificationService';
import type { IFcmService } from '../../../src/application/services/IFcmService';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';
import type { NotificationScheduleEntity } from '../../../src/domain/entities/NotificationSchedule';

function buildSchedule(
  overrides: Partial<NotificationScheduleEntity> = {}
): NotificationScheduleEntity {
  return {
    notification_send_schedule_id: 1,
    user_id: 1,
    event_id: 2,
    gathering_group_id: 3,
    notification_id: 4,
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
  function setup(schedules: NotificationScheduleEntity[] = []) {
    const notificationScheduleRepository: INotificationScheduleRepository = {
      create: vi.fn(),
      findAll: vi.fn(),
      existsUser: vi.fn(),
      existsNotification: vi.fn(),
      existsEventGatheringGroup: vi.fn(),
      claimDue: vi.fn().mockResolvedValue(schedules),
      findTargetTokens: vi.fn().mockResolvedValue([]),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const firebaseTokenRepository: IFirebaseTokenRepository = {
      register: vi.fn(),
      findActiveTokens: vi.fn(),
      deactivate: vi.fn(),
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
        fcmService,
      }),
      notificationScheduleRepository,
      firebaseTokenRepository,
      fcmService,
    };
  }

  it('期限到来した予定を対象グループの有効トークンへ送信し、送信済みにする', async () => {
    const schedule = buildSchedule();
    const { service, notificationScheduleRepository, fcmService } = setup([
      schedule,
    ]);
    (
      notificationScheduleRepository.findTargetTokens as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue([{ firebase_token_id: 9, fcm_token: 'token-a' }]);

    const result = await service.sendScheduledEventNotifications(
      new Date('2026-01-01T09:00:00.000Z')
    );

    expect(notificationScheduleRepository.claimDue).toHaveBeenCalledWith(
      '2026-01-01T09:00:00.000Z'
    );
    expect(fcmService.sendNotificationToToken).toHaveBeenCalledWith({
      token: 'token-a',
      title: '集合のお知らせ',
      body: '集合時刻です。',
      data: { type: 'event_reminder', eventId: '2' },
    });
    expect(notificationScheduleRepository.markSent).toHaveBeenCalledWith(
      1,
      'message-1'
    );
    expect(result).toEqual({ checkedEvents: 1, sent: 1, failed: 0 });
  });

  it('一部のトークン送信に失敗した予定をfailedにし、自動再送しない', async () => {
    const schedule = buildSchedule();
    const {
      service,
      notificationScheduleRepository,
      firebaseTokenRepository,
      fcmService,
    } = setup([schedule]);
    (
      notificationScheduleRepository.findTargetTokens as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue([
      { firebase_token_id: 9, fcm_token: 'token-a' },
      { firebase_token_id: 10, fcm_token: 'token-b' },
    ]);
    (fcmService.sendNotificationToToken as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, messageId: 'message-1' })
      .mockRejectedValueOnce(new Error('UNREGISTERED'));

    const result = await service.sendScheduledEventNotifications();

    expect(firebaseTokenRepository.deactivate).toHaveBeenCalledWith(10);
    expect(notificationScheduleRepository.markFailed).toHaveBeenCalledWith(
      1,
      'UNREGISTERED (sent 1/2 tokens)'
    );
    expect(notificationScheduleRepository.markSent).not.toHaveBeenCalled();
    expect(result).toEqual({ checkedEvents: 1, sent: 1, failed: 1 });
  });

  it('有効なトークンがない予定をfailedにする', async () => {
    const { service, notificationScheduleRepository } = setup([
      buildSchedule(),
    ]);

    const result = await service.sendScheduledEventNotifications();

    expect(notificationScheduleRepository.markFailed).toHaveBeenCalledWith(
      1,
      'No active Firebase tokens for gathering group'
    );
    expect(result).toEqual({ checkedEvents: 1, sent: 0, failed: 1 });
  });
});
