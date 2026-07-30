import { describe, expect, it, vi } from 'vitest';
import { createScheduledNotificationService } from '../../../src/application/services/ScheduledNotificationService';
import type { IFcmService } from '../../../src/application/services/IFcmService';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import type { DueNotificationSchedule } from '../../../src/domain/entities/NotificationSchedule';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';

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
  function setup(
    schedules: DueNotificationSchedule[] = [],
    getCurrentTime?: () => number
  ) {
    const notificationScheduleRepository: INotificationScheduleRepository = {
      create: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      deleteDraft: vi.fn(),
      findDraftsByEvent: vi.fn(),
      existsFirebaseToken: vi.fn(),
      existsEvent: vi.fn(),
      existsNotification: vi.fn(),
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
        getCurrentTime,
      }),
      notificationScheduleRepository,
      firebaseTokenRepository,
      fcmService,
    };
  }

  it('token単位の予定を対応する端末へ送信してsentにする', async () => {
    const { service, notificationScheduleRepository, fcmService } = setup([
      buildSchedule(),
    ]);
    const result = await service.sendScheduledEventNotifications(
      new Date('2026-01-01T09:00:00.000Z')
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
    expect(notificationScheduleRepository.claimDue).toHaveBeenCalledWith(
      '2026-01-01T09:00:00.000Z',
      100
    );
  });

  it('1件が失敗しても別tokenの予定を続けて送信する', async () => {
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
    } = setup(schedules);
    (fcmService.sendNotificationToToken as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, messageId: 'message-1' })
      .mockRejectedValueOnce(new Error('UNREGISTERED'))
      .mockResolvedValueOnce({ success: true, messageId: 'message-3' });
    const result = await service.sendScheduledEventNotifications();
    expect(fcmService.sendNotificationToToken).toHaveBeenCalledTimes(3);
    expect(firebaseTokenRepository.deactivate).toHaveBeenCalledWith(10);
    expect(notificationScheduleRepository.markFailed).toHaveBeenCalledWith(
      2,
      'UNREGISTERED'
    );
    expect(result).toEqual({ checkedEvents: 3, sent: 2, failed: 1 });
  });

  it('無効化済みtokenは送らず予定をfailedにする', async () => {
    const { service, notificationScheduleRepository, fcmService } = setup([
      buildSchedule({ is_firebase_active: 0 }),
    ]);
    const result = await service.sendScheduledEventNotifications();
    expect(fcmService.sendNotificationToToken).not.toHaveBeenCalled();
    expect(notificationScheduleRepository.markFailed).toHaveBeenCalledWith(
      1,
      'Firebase token is inactive'
    );
    expect(result).toEqual({ checkedEvents: 1, sent: 0, failed: 1 });
  });

  it('1回の実行で2000件を100件ずつ重複なく送信する', async () => {
    const pending = Array.from({ length: 2000 }, (_, index) =>
      buildSchedule({
        notification_schedule_id: index + 1,
        firebase_token_id: index + 1,
        fcm_token: `token-${index + 1}`,
      })
    );
    const { service, notificationScheduleRepository, fcmService } = setup();
    (
      notificationScheduleRepository.claimDue as ReturnType<typeof vi.fn>
    ).mockImplementation(async (_now: string, limit: number) =>
      pending.splice(0, limit)
    );

    const result = await service.sendScheduledEventNotifications();

    expect(result).toEqual({
      checkedEvents: 2000,
      sent: 2000,
      failed: 0,
    });
    expect(notificationScheduleRepository.claimDue).toHaveBeenCalledTimes(21);
    expect(fcmService.sendNotificationToToken).toHaveBeenCalledTimes(2000);
    expect(notificationScheduleRepository.markSent).toHaveBeenCalledTimes(2000);
    expect(
      new Set(
        (
          notificationScheduleRepository.markSent as ReturnType<typeof vi.fn>
        ).mock.calls.map(([scheduleId]) => scheduleId)
      ).size
    ).toBe(2000);
    expect(pending).toHaveLength(0);
  });

  it('処理時間の上限に達した場合は次のbatchをclaimしない', async () => {
    const schedules = Array.from({ length: 100 }, (_, index) =>
      buildSchedule({
        notification_schedule_id: index + 1,
        firebase_token_id: index + 1,
        fcm_token: `token-${index + 1}`,
      })
    );
    const getCurrentTime = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(13 * 60 * 1000);
    const { service, notificationScheduleRepository } = setup(
      schedules,
      getCurrentTime
    );

    const result = await service.sendScheduledEventNotifications();

    expect(result).toEqual({
      checkedEvents: 100,
      sent: 100,
      failed: 0,
    });
    expect(notificationScheduleRepository.claimDue).toHaveBeenCalledTimes(1);
  });
});
