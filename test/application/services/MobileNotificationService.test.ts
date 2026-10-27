import { describe, expect, it, vi } from 'vitest';
import { createMobileNotificationService } from '../../../src/application/services/MobileNotificationService';
import type { MobileNotificationEntity } from '../../../src/domain/entities/MobileNotification';
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
      scheduledAt: '2026-07-23T00:00:00.000Z',
      relatedEvent: null,
    };
    (repository.findByIdForUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      entity
    );

    await expect(service.getNotificationById(5, 12)).resolves.toEqual({
      notification_id: 5,
      notification_type: 'notification_general',
      title: 'お知らせ',
      body: '本文',
      scheduled_at: '2026-07-23T00:00:00.000Z',
      related_event: null,
    });
    expect(repository.findByIdForUser).toHaveBeenCalledWith(5, 12);
  });

  it('確定済みページネーションを維持して一覧EntityをDTOへ変換する', async () => {
    const { repository, service } = setup();
    (repository.findAllForUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      notifications: [
        {
          id: 5,
          type: 'notification_general',
          title: '競技通知',
          body: '本文',
          scheduledAt: '2026-07-23T01:15:00.000Z',
          relatedEvent: null,
        },
      ],
      total: 1,
    });

    await expect(
      service.getNotifications(12, { limit: 50, offset: 0 })
    ).resolves.toEqual({
      notifications: [
        {
          notification_id: 5,
          notification_type: 'notification_general',
          title: '競技通知',
          body: '本文',
          scheduled_at: '2026-07-23T01:15:00.000Z',
          related_event: null,
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

  it('一覧・詳細で関連イベントを同じHTTP契約へ変換する', async () => {
    const { repository, service } = setup();
    const entity: MobileNotificationEntity = {
      id: 5,
      type: 'notification_general',
      title: '集合時間のお知らせ',
      body: '集合してください。',
      scheduledAt: '2026-07-23T01:15:00.000Z',
      relatedEvent: {
        id: 7,
        name: '大縄跳び',
        startTime: '1030',
        endTime: '1100',
        venues: [{ id: 3, name: '体育館' }],
      },
    };
    vi.mocked(repository.findByIdForUser).mockResolvedValue(entity);
    vi.mocked(repository.findAllForUser).mockResolvedValue({
      notifications: [entity],
      total: 1,
    });
    const expected = {
      event_id: 7,
      event_name: '大縄跳び',
      start_time: '1030',
      end_time: '1100',
      venues: [{ venue_id: 3, venue_name: '体育館' }],
    };
    expect((await service.getNotificationById(5, 12)).related_event).toEqual(
      expected
    );
    expect(
      (await service.getNotifications(12, { limit: 50, offset: 0 }))
        .notifications[0].related_event
    ).toEqual(expected);
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
});
