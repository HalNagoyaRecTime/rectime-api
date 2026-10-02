import { describe, expect, it, vi } from 'vitest';
import { createMobileNotificationService } from '../../../src/application/services/MobileNotificationService';
import type { IMobileNotificationRepository } from '../../../src/domain/interfaces/repositories/IMobileNotificationRepository';

describe('MobileNotificationService', () => {
  function setup() {
    const repository: IMobileNotificationRepository = {
      findAllForUser: vi
        .fn()
        .mockResolvedValue({ notifications: [], total: 0 }),
      findByIdForUser: vi.fn(),
    };
    return {
      repository,
      service: createMobileNotificationService(repository),
    };
  }

  it('ログイン利用者とページネーション条件をRepositoryへ渡す', async () => {
    const { repository, service } = setup();

    await service.getNotifications(12, { limit: 20, offset: 10 });

    expect(repository.findAllForUser).toHaveBeenCalledWith({
      userId: 12,
      limit: 20,
      offset: 10,
    });
  });

  it('本人宛ての通知EntityをDTOへ変換して返す', async () => {
    const { repository, service } = setup();
    const entity = {
      id: 5,
      type: 'notification_general',
      title: 'お知らせ',
      body: '本文',
      scheduledAt: '2026-07-23T09:00:00+09:00',
      relatedEvent: null,
    };
    (repository.findByIdForUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      entity
    );

    await expect(service.getNotificationById(5, 12)).resolves.toEqual({
      notification_id: 5,
      notification_type: 'manual',
      title: 'お知らせ',
      body: '本文',
      scheduled_at: '2026-07-23T09:00:00+09:00',
      related_event: null,
    });
    expect(repository.findByIdForUser).toHaveBeenCalledWith(5, 12);
  });

  it('一覧のEntityをDTOへ変換しデフォルトページネーションを返す', async () => {
    const { repository, service } = setup();
    (repository.findAllForUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      notifications: [
        {
          id: 5,
          type: 'event_reminder',
          title: '競技通知',
          body: '本文',
          scheduledAt: '2026-07-23T10:15:00+09:00',
          relatedEvent: {
            id: 3,
            name: '綱引き',
            venues: [
              { venue_id: 2, venue_name: 'グラウンド' },
              { venue_id: 7, venue_name: '第1体育館' },
            ],
            startTime: '1030',
            endTime: '1100',
          },
        },
      ],
      total: 1,
    });

    await expect(service.getNotifications(12, {})).resolves.toEqual({
      notifications: [
        {
          notification_id: 5,
          notification_type: 'event_reminder',
          title: '競技通知',
          body: '本文',
          scheduled_at: '2026-07-23T10:15:00+09:00',
          related_event: {
            event_id: 3,
            event_name: '綱引き',
            venues: [
              { venue_id: 2, venue_name: 'グラウンド' },
              { venue_id: 7, venue_name: '第1体育館' },
            ],
            start_time: '1030',
            end_time: '1100',
          },
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    expect(repository.findAllForUser).toHaveBeenCalledWith({
      userId: 12,
      limit: 50,
      offset: 0,
    });
  });

  it('本人宛てではない通知は存在しないものとして扱う', async () => {
    const { repository, service } = setup();
    (repository.findByIdForUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    await expect(service.getNotificationById(5, 12)).rejects.toThrow(
      'Notification not found'
    );
  });

  it.each(['notification_general', 'manual', 'event_reminder'])(
    '一覧と詳細の%sをMobile互換値へ変換しDomain値を保持する',
    async type => {
      const { repository, service } = setup();
      const entity = {
        id: 5,
        type,
        title: '通知',
        body: '本文',
        scheduledAt: '2026-07-23T00:00:00.000Z',
        relatedEvent: null,
      };
      vi.mocked(repository.findAllForUser).mockResolvedValue({
        notifications: [entity],
        total: 1,
      });
      vi.mocked(repository.findByIdForUser).mockResolvedValue(entity);

      const expectedType = type === 'notification_general' ? 'manual' : type;
      const list = await service.getNotifications(12, {});
      const detail = await service.getNotificationById(5, 12);
      expect(list.notifications[0]).toEqual(detail);
      expect(detail.notification_type).toBe(expectedType);
      expect(entity.type).toBe(type);
    }
  );
});
