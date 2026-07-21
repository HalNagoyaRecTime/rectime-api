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
    created_user_id: 1,
    event_id: 2,
    firebase_token_id: 9,
    fcm_token: 'token-a',
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
      findById: vi.fn(),
      deleteDraft: vi.fn(),
      findDraftsByEventAndTokens: vi.fn(),
      findActiveFirebaseTokenIdsByGatheringGroup: vi.fn(),
      updateDraft: vi.fn(),
      existsUser: vi.fn(),
      existsNotification: vi.fn(),
      existsEvent: vi.fn(),
      existsFirebaseToken: vi.fn(),
      claimDue: vi.fn().mockResolvedValue(schedules),
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

  it('期限到来した予定をそのFirebaseトークンへ送信し、送信済みにする', async () => {
    const schedule = buildSchedule();
    const { service, notificationScheduleRepository, fcmService } = setup([
      schedule,
    ]);

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

  it('複数の予定を独立に送信し、成功と失敗を個別に記録する', async () => {
    const first = buildSchedule({
      notification_send_schedule_id: 1,
      firebase_token_id: 9,
      fcm_token: 'token-a',
    });
    const second = buildSchedule({
      notification_send_schedule_id: 2,
      firebase_token_id: 10,
      fcm_token: 'token-b',
    });
    const {
      service,
      notificationScheduleRepository,
      firebaseTokenRepository,
      fcmService,
    } = setup([first, second]);
    (fcmService.sendNotificationToToken as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, messageId: 'message-1' })
      .mockRejectedValueOnce(new Error('UNREGISTERED'));

    const result = await service.sendScheduledEventNotifications();

    expect(notificationScheduleRepository.markSent).toHaveBeenCalledWith(
      1,
      'message-1'
    );
    expect(notificationScheduleRepository.markFailed).toHaveBeenCalledWith(
      2,
      'UNREGISTERED'
    );
    expect(firebaseTokenRepository.deactivate).toHaveBeenCalledWith(10);
    expect(result).toEqual({ checkedEvents: 2, sent: 1, failed: 1 });
  });

  it('無効化対象ではないエラーではトークンを無効化しない', async () => {
    const { service, firebaseTokenRepository, fcmService } = setup([
      buildSchedule(),
    ]);
    (
      fcmService.sendNotificationToToken as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('internal error'));

    const result = await service.sendScheduledEventNotifications();

    expect(firebaseTokenRepository.deactivate).not.toHaveBeenCalled();
    expect(result).toEqual({ checkedEvents: 1, sent: 0, failed: 1 });
  });
});
