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
    findAll: vi.fn(),
    findById: vi.fn().mockResolvedValue(event),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hasReferences: vi.fn(),
  };
  const eventScheduleRepository: IEventScheduleRepository = { apply: vi.fn() };
  const notificationScheduleRepository: INotificationScheduleRepository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    deleteDraft: vi.fn(),
    findDraftsByEvent: vi.fn().mockResolvedValue([schedule]),
    existsFirebaseToken: vi.fn(),
    existsEvent: vi.fn(),
    existsNotification: vi.fn(),
    claimDue: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
  };
  const userRepository: IUserRepository = {
    isStaffOrTeacher: vi.fn().mockResolvedValue(true),
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
      event_name: '大縄跳び',
      start_time: '1030',
      end_time: '1100',
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
});
