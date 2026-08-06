import { describe, expect, it, vi } from 'vitest';
import { createEventScheduleService } from '../../../src/application/services/EventScheduleService';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { IEventScheduleRepository } from '../../../src/domain/interfaces/repositories/IEventScheduleRepository';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

const event = {
  event_id: 1,
  event_name: '大縄跳び',
  rule_text: null,
  venue: '体育館',
  start_time: '1030',
  end_time: '1100',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const schedule = {
  notification_schedule_id: 6,
  created_user_id: 7,
  event_id: 1,
  notification_id: 5,
  firebase_token_id: 9,
  importance: 2,
  notification_type: 'event_reminder',
  title: '大縄跳び開始のお知らせ',
  body: '本文',
  send_status: 'draft' as const,
  fcm_message_id: null,
  failed_reason: null,
  send_at: '2026-11-07T01:15:00.000Z',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

function setup() {
  const eventRepository: IEventRepository = {
    exists: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn().mockResolvedValue(event),
    create: vi.fn(),
    delete: vi.fn(),
    hasReferences: vi.fn(),
  };
  const eventScheduleRepository: IEventScheduleRepository = {
    apply: vi.fn(),
    getNotificationSummary: vi.fn().mockResolvedValue({
      scheduled_at: null,
      total: 0,
      draft: 0,
      sending: 0,
      sent: 0,
      failed: 0,
    }),
  };
  const notificationScheduleRepository: INotificationScheduleRepository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    deleteDraft: vi.fn(),
    findDraftsByEvent: vi.fn().mockResolvedValue([schedule]),
    existsFirebaseToken: vi.fn(),
    existsEvent: vi.fn(),
    existsNotification: vi.fn(),
    findDeliveryCandidateIds: vi.fn(),
    claimForDelivery: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
  };
  const userRepository: IUserRepository = {
    exists: vi.fn(),
    isStaffOrTeacher: vi.fn().mockResolvedValue(true),
    getUserCategories: vi.fn(),
    findUserIdByMicrosoftAccount: vi.fn(),
    createUserWithMicrosoftLink: vi.fn(),
    updateUser: vi.fn(),
  };
  return {
    eventRepository,
    eventScheduleRepository,
    notificationScheduleRepository,
    userRepository,
    service: createEventScheduleService({
      eventRepository,
      eventScheduleRepository,
      notificationScheduleRepository,
      userRepository,
    }),
  };
}

const input = {
  event_id: 1,
  user_id: 7,
  start_time: '1030',
  end_time: '1100',
  notification_enabled: true,
  event_date: '2026-11-07',
};

describe('EventScheduleService', () => {
  it('イベント全参加者向けに開始15分前のdraftを再生成する', async () => {
    const { service, eventScheduleRepository, notificationScheduleRepository } =
      setup();
    await expect(service.updateEventSchedule(input)).resolves.toEqual({
      event,
      notification_enabled: true,
      notification_schedules: [schedule],
    });
    expect(eventScheduleRepository.apply).toHaveBeenCalledWith({
      event_id: 1,
      user_id: 7,
      event_name: undefined,
      rule_text: undefined,
      venue: undefined,
      start_time: '1030',
      end_time: '1100',
      expected_event: event,
      refresh_notifications: true,
      notification_enabled: true,
      send_at: '2026-11-07T01:15:00.000Z',
    });
    expect(
      notificationScheduleRepository.findDraftsByEvent
    ).toHaveBeenCalledWith(1);
  });

  it('通知なしではdraft一覧を取得しない', async () => {
    const { service, notificationScheduleRepository } = setup();
    await expect(
      service.updateEventSchedule({ ...input, notification_enabled: false })
    ).resolves.toEqual({
      event,
      notification_enabled: false,
      notification_schedules: [],
    });
    expect(
      notificationScheduleRepository.findDraftsByEvent
    ).not.toHaveBeenCalled();
  });

  it('通知設定省略時は既存の自動draftを維持して再生成する', async () => {
    const { service, eventScheduleRepository, notificationScheduleRepository } =
      setup();

    await expect(
      service.updateEventSchedule({
        ...input,
        notification_enabled: undefined,
      })
    ).resolves.toEqual({
      event,
      notification_enabled: true,
      notification_schedules: [schedule],
    });
    expect(eventScheduleRepository.apply).toHaveBeenCalledWith(
      expect.objectContaining({ notification_enabled: true })
    );
    expect(
      notificationScheduleRepository.findDraftsByEvent
    ).toHaveBeenCalledTimes(2);
  });

  it('通知設定省略時に自動draftがなければ新規作成しない', async () => {
    const { service, eventScheduleRepository, notificationScheduleRepository } =
      setup();
    (
      notificationScheduleRepository.findDraftsByEvent as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue([]);

    await expect(
      service.updateEventSchedule({
        ...input,
        notification_enabled: undefined,
      })
    ).resolves.toEqual({
      event,
      notification_enabled: false,
      notification_schedules: [],
    });
    expect(eventScheduleRepository.apply).toHaveBeenCalledWith(
      expect.objectContaining({ notification_enabled: false })
    );
    expect(
      notificationScheduleRepository.findDraftsByEvent
    ).toHaveBeenCalledTimes(1);
  });

  it('staffsまたはteachersではないユーザーの更新を拒否する', async () => {
    const { service, userRepository, eventScheduleRepository } = setup();
    (
      userRepository.isStaffOrTeacher as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);
    await expect(service.updateEventSchedule(input)).rejects.toThrow(
      'Schedule update forbidden'
    );
    expect(eventScheduleRepository.apply).not.toHaveBeenCalled();
  });

  it('競技情報と通知設定を同じRepository処理へ渡す', async () => {
    const { service, eventScheduleRepository } = setup();
    await service.updateEventSchedule({
      ...input,
      event_name: '大縄跳び決勝',
      rule_text: '決勝ルール',
      venue: 'メインアリーナ',
    });

    expect(eventScheduleRepository.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: '大縄跳び決勝',
        rule_text: '決勝ルール',
        venue: 'メインアリーナ',
      })
    );
  });

  it('会場だけの部分更新はEVENT_DATEなしでも通知予定を再生成しない', async () => {
    const { service, eventScheduleRepository } = setup();

    await service.updateEventSchedule({
      event_id: 1,
      user_id: 7,
      venue: 'サブアリーナ',
    });

    expect(eventScheduleRepository.apply).toHaveBeenCalledWith({
      event_id: 1,
      user_id: 7,
      venue: 'サブアリーナ',
      event_name: undefined,
      rule_text: undefined,
      start_time: undefined,
      end_time: undefined,
      expected_event: event,
      refresh_notifications: false,
      notification_enabled: true,
      send_at: undefined,
    });
  });

  it('通知OFFはEVENT_DATEなしでもdraft削除処理へ進む', async () => {
    const { service, eventScheduleRepository } = setup();

    await service.updateEventSchedule({
      event_id: 1,
      user_id: 7,
      notification_enabled: false,
    });

    expect(eventScheduleRepository.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_event: event,
        refresh_notifications: true,
        notification_enabled: false,
        send_at: undefined,
      })
    );
  });

  it('自動通知を生成する更新はEVENT_DATEがなければ拒否する', async () => {
    const { service, eventScheduleRepository } = setup();

    await expect(
      service.updateEventSchedule({
        event_id: 1,
        user_id: 7,
        start_time: '1040',
      })
    ).rejects.toThrow('EVENT_DATE is not configured correctly');
    expect(eventScheduleRepository.apply).not.toHaveBeenCalled();
  });

  it('部分更新後の開始・終了時刻が不正になる場合は拒否する', async () => {
    const { service, eventScheduleRepository } = setup();

    await expect(
      service.updateEventSchedule({
        event_id: 1,
        user_id: 7,
        start_time: '1130',
        event_date: '2026-11-07',
      })
    ).rejects.toThrow('end_time must be after start_time');
    expect(eventScheduleRepository.apply).not.toHaveBeenCalled();
  });

  it('競技単位の自動通知集約を返す', async () => {
    const { service, eventScheduleRepository } = setup();
    (
      eventScheduleRepository.getNotificationSummary as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      scheduled_at: '2026-11-07T01:15:00.000Z',
      total: 3,
      draft: 1,
      sending: 0,
      sent: 1,
      failed: 1,
    });

    await expect(service.getEventNotificationSummary(1, 7)).resolves.toEqual({
      event_id: 1,
      scheduled_at: '2026-11-07T01:15:00.000Z',
      total: 3,
      draft: 1,
      sending: 0,
      sent: 1,
      failed: 1,
    });
  });

  it('権限がないユーザーは通知集約を取得できない', async () => {
    const { service, userRepository, eventScheduleRepository } = setup();
    (
      userRepository.isStaffOrTeacher as ReturnType<typeof vi.fn>
    ).mockResolvedValue(false);

    await expect(service.getEventNotificationSummary(1, 7)).rejects.toThrow(
      'Schedule update forbidden'
    );
    expect(
      eventScheduleRepository.getNotificationSummary
    ).not.toHaveBeenCalled();
  });
});
