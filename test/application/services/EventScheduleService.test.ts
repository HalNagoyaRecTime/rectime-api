import { describe, expect, it, vi } from 'vitest';
import { createEventScheduleService } from '../../../src/application/services/EventScheduleService';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { IGatheringRepository } from '../../../src/domain/interfaces/repositories/IGatheringRepository';
import type { INotificationRepository } from '../../../src/domain/interfaces/repositories/INotificationRepository';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';

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
  gathering_group_name: 'A組',
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
  user_id: 7,
  event_id: 1,
  gathering_group_id: 3,
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
  const notificationRepository: INotificationRepository = {
    create: vi.fn().mockResolvedValue(notification),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn().mockResolvedValue(notification),
  };
  const notificationScheduleRepository: INotificationScheduleRepository = {
    create: vi.fn().mockResolvedValue(schedule),
    findAll: vi.fn(),
    findById: vi.fn(),
    deleteDraft: vi.fn(),
    findDraftsByEventAndGroup: vi.fn().mockResolvedValue([]),
    updateDraft: vi.fn().mockResolvedValue(schedule),
    deleteDraftsByEventAndGroup: vi.fn().mockResolvedValue(0),
    existsUser: vi.fn(),
    existsNotification: vi.fn(),
    existsEventGatheringGroup: vi.fn(),
    claimDue: vi.fn(),
    findTargetTokensByGatheringGroupIds: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
  };
  return {
    eventRepository,
    gatheringRepository,
    notificationRepository,
    notificationScheduleRepository,
    service: createEventScheduleService({
      eventRepository,
      gatheringRepository,
      notificationRepository,
      notificationScheduleRepository,
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
    const {
      service,
      eventRepository,
      notificationRepository,
      notificationScheduleRepository,
    } = setup();

    await expect(service.updateEventSchedule(input)).resolves.toEqual({
      event,
      notification_enabled: true,
      notification_schedule: schedule,
    });
    expect(eventRepository.updateTimes).toHaveBeenCalledWith(1, {
      start_time: '1030',
      end_time: '1100',
    });
    expect(notificationRepository.create).toHaveBeenCalledWith({
      notification_type: 'event_reminder',
      title: '大縄跳び開始のお知らせ',
      body: '大縄跳びの開始時間が近づいています。該当チームは体育館前へ集合してください。',
    });
    expect(notificationScheduleRepository.create).toHaveBeenCalledWith({
      user_id: 7,
      event_id: 1,
      gathering_group_id: 3,
      notification_id: 5,
      importance: 2,
      send_at: '2026-11-07T01:15:00.000Z',
    });
  });

  it('既存draftの本文と時刻を更新し、重複draftを一括削除する', async () => {
    const { service, notificationRepository, notificationScheduleRepository } =
      setup();
    (
      notificationScheduleRepository.findDraftsByEventAndGroup as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue([
      schedule,
      { ...schedule, notification_send_schedule_id: 8 },
    ]);

    await service.updateEventSchedule({ ...input, start_time: '1040' });

    expect(notificationRepository.create).not.toHaveBeenCalled();
    expect(notificationRepository.update).toHaveBeenCalledWith(5, {
      title: '大縄跳び開始のお知らせ',
      body: '大縄跳びの開始時間が近づいています。該当チームは体育館前へ集合してください。',
    });
    expect(notificationScheduleRepository.updateDraft).toHaveBeenCalledWith(6, {
      notification_id: 5,
      send_at: '2026-11-07T01:25:00.000Z',
    });
    expect(
      notificationScheduleRepository.deleteDraftsByEventAndGroup
    ).toHaveBeenCalledWith(1, 3, 6);
  });

  it('通知なしでは関連draftだけを削除する', async () => {
    const { service, notificationRepository, notificationScheduleRepository } =
      setup();

    await expect(
      service.updateEventSchedule({ ...input, notification_enabled: false })
    ).resolves.toEqual({
      event,
      notification_enabled: false,
      notification_schedule: null,
    });
    expect(
      notificationScheduleRepository.deleteDraftsByEventAndGroup
    ).toHaveBeenCalledWith(1, 3);
    expect(notificationRepository.create).not.toHaveBeenCalled();
    expect(notificationScheduleRepository.create).not.toHaveBeenCalled();
  });

  it('競技に属さないグループでは時刻も通知も変更しない', async () => {
    const { service, gatheringRepository, eventRepository } = setup();
    (
      gatheringRepository.findByEventAndGroup as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    await expect(service.updateEventSchedule(input)).rejects.toThrow(
      'Gathering group is not assigned to event'
    );
    expect(eventRepository.updateTimes).not.toHaveBeenCalled();
  });
});
