import { describe, expect, it, vi } from 'vitest';
import { createEventGatheringSettingsService } from '../../../src/application/services/EventGatheringSettingsService';
import type { EventGatheringEntity } from '../../../src/domain/entities/EventGathering';
import type { IEventGatheringSettingsRepository } from '../../../src/domain/interfaces/repositories/IEventGatheringSettingsRepository';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { IGatheringSpotRepository } from '../../../src/domain/interfaces/repositories/IGatheringSpotRepository';

const EVENT_ID = 12;

const existing: EventGatheringEntity[] = [
  {
    gathering_id: 101,
    round: 1,
    gathering_time: '10:45',
    gathering_spot_id: 1,
    gathering_spot_name: '出入口①',
    member_count: 16,
  },
  {
    gathering_id: 102,
    round: 1,
    gathering_time: '10:55',
    gathering_spot_id: 2,
    gathering_spot_name: '出入口②',
    member_count: 0,
  },
];

function setup(
  options: {
    current?: EventGatheringEntity[];
    eventExists?: boolean;
    existingSpotIds?: number[];
    applyError?: Error;
  } = {}
) {
  const current = options.current ?? existing;
  const eventRepository: IEventRepository = {
    exists: vi.fn().mockResolvedValue(options.eventExists ?? true),
    findAll: vi.fn(),
    findById: vi.fn(),
    findByParticipantUserId: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    hasReferences: vi.fn(),
  };
  const gatheringSpotRepository: IGatheringSpotRepository = {
    exists: vi.fn(),
    findExistingIds: vi
      .fn()
      .mockResolvedValue(new Set(options.existingSpotIds ?? [1, 2, 3])),
    findAll: vi.fn(),
    findPage: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hasGatherings: vi.fn(),
  };
  const repository: IEventGatheringSettingsRepository = {
    // 1回目は差分計算用、2回目は保存後のレスポンス用
    findByEventId: vi.fn().mockResolvedValue(current),
    apply: options.applyError
      ? vi.fn().mockRejectedValue(options.applyError)
      : vi.fn().mockResolvedValue(undefined),
  };
  const service = createEventGatheringSettingsService(
    eventRepository,
    gatheringSpotRepository,
    repository
  );
  return { service, eventRepository, gatheringSpotRepository, repository };
}

describe('EventGatheringSettingsService', () => {
  describe('差分の組み立て', () => {
    it('gathering_id の無い集合予定は作成、リクエストに無い既存は削除に振り分ける', async () => {
      const { service, repository } = setup({
        current: [existing[1]],
      });

      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 2,
            gatherings: [{ gathering_time: '11:00', gathering_spot_id: 3 }],
          },
        ],
      });

      expect(repository.apply).toHaveBeenCalledWith({
        event_id: EVENT_ID,
        creates: [{ round: 2, gathering_time: '11:00', gathering_spot_id: 3 }],
        updates: [],
        delete_ids: [102],
      });
    });

    it('gathering_id のある集合予定はIDを維持して更新する', async () => {
      const { service, repository } = setup();

      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 2,
            gatherings: [
              {
                gathering_id: 101,
                gathering_time: '10:45',
                gathering_spot_id: 1,
              },
              {
                gathering_id: 102,
                gathering_time: '11:00',
                gathering_spot_id: 2,
              },
            ],
          },
        ],
      });

      expect(repository.apply).toHaveBeenCalledWith({
        event_id: EVENT_ID,
        creates: [],
        updates: [
          {
            gathering_id: 101,
            round: 2,
            gathering_time: '10:45',
            gathering_spot_id: 1,
          },
          {
            gathering_id: 102,
            round: 2,
            gathering_time: '11:00',
            gathering_spot_id: 2,
          },
        ],
        delete_ids: [],
      });
    });

    // 変更のない行まで更新すると updated_at だけが進む。
    it('内容が変わらない集合予定は更新に含めない', async () => {
      const { service, repository } = setup();

      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 1,
            gatherings: [
              {
                gathering_id: 101,
                gathering_time: '10:45',
                gathering_spot_id: 1,
              },
              {
                gathering_id: 102,
                gathering_time: '10:55',
                gathering_spot_id: 2,
              },
            ],
          },
        ],
      });

      expect(repository.apply).toHaveBeenCalledWith({
        event_id: EVENT_ID,
        creates: [],
        updates: [],
        delete_ids: [],
      });
    });

    it('rounds が空なら参加者のいない既存をすべて削除する', async () => {
      const { service, repository } = setup({ current: [existing[1]] });

      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: [],
      });

      expect(repository.apply).toHaveBeenCalledWith({
        event_id: EVENT_ID,
        creates: [],
        updates: [],
        delete_ids: [102],
      });
    });
  });

  describe('保存前の検証', () => {
    it('Eventが存在しない場合は何もせず Event not found', async () => {
      const { service, repository, gatheringSpotRepository } = setup({
        eventExists: false,
      });

      await expect(
        service.saveEventGatheringSettings({ event_id: EVENT_ID, rounds: [] })
      ).rejects.toThrow('Event not found');
      expect(gatheringSpotRepository.findExistingIds).not.toHaveBeenCalled();
      expect(repository.apply).not.toHaveBeenCalled();
    });

    it('対象Event配下に無い gathering_id は Gathering not found', async () => {
      const { service, repository } = setup();

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: [
            {
              round: 1,
              gatherings: [
                {
                  gathering_id: 999,
                  gathering_time: '10:45',
                  gathering_spot_id: 1,
                },
              ],
            },
          ],
        })
      ).rejects.toThrow('Gathering not found');
      expect(repository.apply).not.toHaveBeenCalled();
    });

    it('存在しない集合場所を含む場合は Gathering spot not found', async () => {
      const { service, repository, gatheringSpotRepository } = setup({
        existingSpotIds: [1],
      });

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: [
            {
              round: 1,
              gatherings: [
                {
                  gathering_id: 101,
                  gathering_time: '10:45',
                  gathering_spot_id: 1,
                },
                { gathering_time: '10:50', gathering_spot_id: 9 },
              ],
            },
          ],
        })
      ).rejects.toThrow('Gathering spot not found');
      // 同じ集合場所を複数回使っても、問い合わせは重複を除いた1回
      expect(gatheringSpotRepository.findExistingIds).toHaveBeenCalledWith([
        1, 9,
      ]);
      expect(repository.apply).not.toHaveBeenCalled();
    });

    it('参加者が残っている集合予定がリクエストから外れていたら Gathering in use', async () => {
      const { service, repository } = setup();

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: [
            {
              round: 1,
              gatherings: [
                {
                  gathering_id: 102,
                  gathering_time: '10:55',
                  gathering_spot_id: 2,
                },
              ],
            },
          ],
        })
      ).rejects.toThrow('Gathering in use');
      expect(repository.apply).not.toHaveBeenCalled();
    });
  });

  describe('保存時の外部キー違反', () => {
    const foreignKeyError = new Error(
      'D1_ERROR: FOREIGN KEY constraint failed'
    );

    it('集合場所が残っていれば削除対象に参加者が加わったとみなす', async () => {
      const { service } = setup({
        current: [existing[1]],
        applyError: foreignKeyError,
      });

      await expect(
        service.saveEventGatheringSettings({ event_id: EVENT_ID, rounds: [] })
      ).rejects.toThrow('Gathering in use');
    });

    it('Drizzleに包まれて cause に入った外部キー違反も同じ扱いにする', async () => {
      const { service } = setup({
        current: [existing[1]],
        applyError: new Error('Failed query', { cause: foreignKeyError }),
      });

      await expect(
        service.saveEventGatheringSettings({ event_id: EVENT_ID, rounds: [] })
      ).rejects.toThrow('Gathering in use');
    });

    it('保存の間に集合場所が消えていれば Gathering spot not found', async () => {
      const { service, gatheringSpotRepository } = setup({
        current: [],
        applyError: foreignKeyError,
      });
      vi.mocked(gatheringSpotRepository.findExistingIds)
        .mockResolvedValueOnce(new Set([3]))
        .mockResolvedValueOnce(new Set());

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: [
            {
              round: 1,
              gatherings: [{ gathering_time: '11:00', gathering_spot_id: 3 }],
            },
          ],
        })
      ).rejects.toThrow('Gathering spot not found');
    });

    it('保存の間にEventが消えていれば Event not found', async () => {
      const { service, eventRepository } = setup({
        current: [],
        applyError: foreignKeyError,
      });
      vi.mocked(eventRepository.exists)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: [
            {
              round: 1,
              gatherings: [{ gathering_time: '11:00', gathering_spot_id: 3 }],
            },
          ],
        })
      ).rejects.toThrow('Event not found');
    });

    it('外部キー違反以外の失敗はそのまま投げる', async () => {
      const { service } = setup({
        current: [],
        applyError: new Error('D1_ERROR: database is locked'),
      });

      await expect(
        service.saveEventGatheringSettings({ event_id: EVENT_ID, rounds: [] })
      ).rejects.toThrow('database is locked');
    });
  });

  describe('保存後のレスポンス', () => {
    it('保存後に再取得した一覧をRound単位に束ねて返す', async () => {
      const saved: EventGatheringEntity[] = [
        { ...existing[0], round: 1 },
        { ...existing[1], round: 1 },
        {
          gathering_id: 103,
          round: 2,
          gathering_time: '11:00',
          gathering_spot_id: 3,
          gathering_spot_name: '出入口③',
          member_count: 0,
        },
      ];
      const { service, repository } = setup();
      vi.mocked(repository.findByEventId)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(saved);

      const result = await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 1,
            gatherings: [
              {
                gathering_id: 101,
                gathering_time: '10:45',
                gathering_spot_id: 1,
              },
              {
                gathering_id: 102,
                gathering_time: '10:55',
                gathering_spot_id: 2,
              },
            ],
          },
          {
            round: 2,
            gatherings: [{ gathering_time: '11:00', gathering_spot_id: 3 }],
          },
        ],
      });

      expect(result).toEqual({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 1,
            gatherings: [
              {
                gathering_id: 101,
                gathering_time: '10:45',
                gathering_spot: {
                  gathering_spot_id: 1,
                  gathering_spot_name: '出入口①',
                },
                member_count: 16,
              },
              {
                gathering_id: 102,
                gathering_time: '10:55',
                gathering_spot: {
                  gathering_spot_id: 2,
                  gathering_spot_name: '出入口②',
                },
                member_count: 0,
              },
            ],
          },
          {
            round: 2,
            gatherings: [
              {
                gathering_id: 103,
                gathering_time: '11:00',
                gathering_spot: {
                  gathering_spot_id: 3,
                  gathering_spot_name: '出入口③',
                },
                member_count: 0,
              },
            ],
          },
        ],
      });
      expect(repository.findByEventId).toHaveBeenCalledTimes(2);
    });
  });
});
