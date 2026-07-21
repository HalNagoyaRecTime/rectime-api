import { describe, expect, it, vi } from 'vitest';
import { createEventScheduleService } from '../../../src/application/services/EventScheduleService';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { IEventScheduleRepository } from '../../../src/domain/interfaces/repositories/IEventScheduleRepository';
import type { IGatheringRepository } from '../../../src/domain/interfaces/repositories/IGatheringRepository';
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
const gathering = {
  gathering_id: 2,
  gathering_group_id: 3,
  event_id: 1,
  gathering_spot_id: 4,
  gathering_time: '10:10',
  round: 1,
  gathering_group_user_id: 9,
  event_name: '大縄跳び',
  gathering_spot_name: '体育館前',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const notification = {
  notification_id: 5,
  notification_type: 'event_reminder',
  title: '大縄跳び開始のお知らせ',
  body: '本文',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const schedule = {
  notification_send_schedule_id: 6,
  created_user_id: 7,
  event_id: 1,
  firebase_token_id: 42,
  fcm_token: 'token-42',
  notification_id: 5,
  importance: 2,
  notification_type: 'event_reminder',
  title: notification.title,
  body: notification.body,
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
    updateTimes: vi.fn().mockResolvedValue(event),
  };
  const gatheringRepository: IGatheringRepository = {
    findAll: vi.fn(),
    existsGatheringGroup: vi.fn(),
    existsEvent: vi.fn(),
    existsGatheringSpot: vi.fn(),
    create: vi.fn(),
    findByEventAndGroup: vi.fn().mockResolvedValue(gathering),
  };
  const eventScheduleRepository: IEventScheduleRepository = {
    apply: vi.fn(),
  };
  const notificationScheduleRepository: INotificationScheduleRepository = {
    create: vi.fn().mockResolvedValue(schedule),
    findAll: vi.fn(),
    findById: vi.fn(),
    deleteDraft: vi.fn(),
    findDraftsByEventAndTokens: vi.fn().mockResolvedValue([schedule]),
    findActiveFirebaseTokenIdsByGatheringGroup: vi.fn().mockResolvedValue([42]),
    updateDraft: vi.fn().mockResolvedValue(schedule),
    existsUser: vi.fn(),
    existsNotification: vi.fn(),
    existsEvent: vi.fn(),
    existsFirebaseToken: vi.fn(),
    existsFirebaseTokenGatheringForEvent: vi.fn(),
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
    gatheringRepository,
    notificationScheduleRepository,
    userRepository,
    service: createEventScheduleService({
      eventRepository,
      eventScheduleRepository,
      gatheringRepository,
      notificationScheduleRepository,
      userRepository,
    }),
  };
}

const input = {
  event_id: 1,
  user_id: 7,
  gathering_group_id: 3,
  start_time: '1030',
  end_time: '1100',
  notification_enabled: true,
  event_date: '2026-11-07',
};

describe('EventScheduleService', () => {
  it('通知ありの初回設定で通知内容と開始15分前のdraftを作成する', async () => {
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
      gathering_group_id: 3,
      start_time: '1030',
      end_time: '1100',
      notification_enabled: true,
      notification_title: '大縄跳び開始のお知らせ',
      notification_body:
        '大縄跳びの開始時間が近づいています。該当チームは体育館前へ集合してください。',
      send_at: '2026-11-07T01:15:00.000Z',
    });
    expect(
      notificationScheduleRepository.findActiveFirebaseTokenIdsByGatheringGroup
    ).toHaveBeenCalledWith(3);
    expect(
      notificationScheduleRepository.findDraftsByEventAndTokens
    ).toHaveBeenCalledWith(1, [42]);
  });

  it('通知なしでは関連draftだけを削除する', async () => {
    const { service, eventScheduleRepository, notificationScheduleRepository } =
      setup();

    await expect(
      service.updateEventSchedule({ ...input, notification_enabled: false })
    ).resolves.toEqual({
      event,
      notification_enabled: false,
      notification_schedules: [],
    });
    expect(eventScheduleRepository.apply).toHaveBeenCalledWith(
      expect.objectContaining({ notification_enabled: false })
    );
    expect(
      notificationScheduleRepository.findActiveFirebaseTokenIdsByGatheringGroup
    ).not.toHaveBeenCalled();
    expect(
      notificationScheduleRepository.findDraftsByEventAndTokens
    ).not.toHaveBeenCalled();
  });

  it('競技に属さないグループでは時刻も通知も変更しない', async () => {
    const { service, gatheringRepository, eventScheduleRepository } = setup();
    (
      gatheringRepository.findByEventAndGroup as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    await expect(service.updateEventSchedule(input)).rejects.toThrow(
      'Gathering group is not assigned to event'
    );
    expect(eventScheduleRepository.apply).not.toHaveBeenCalled();
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
