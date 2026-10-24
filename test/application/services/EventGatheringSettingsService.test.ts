import { describe, expect, it, vi } from 'vitest';
import { createEventGatheringSettingsService } from '../../../src/application/services/EventGatheringSettingsService';
import type { EventGatheringEntity } from '../../../src/domain/entities/EventGathering';
import type { IEventGatheringSettingsRepository } from '../../../src/domain/interfaces/repositories/IEventGatheringSettingsRepository';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { IGatheringSpotRepository } from '../../../src/domain/interfaces/repositories/IGatheringSpotRepository';
import type { IGatheringNotificationGeneratorService } from '../../../src/application/services/GatheringNotificationGeneratorService';

const EVENT_ID = 12;

const existing: EventGatheringEntity[] = [
  {
    gathering_id: 101,
    round: 1,
    gathering_time: '10:45',
    round_start_time: null,
    gathering_spot_id: 1,
    gathering_spot_name: '出入口①',
    gathering_spot_image_key: null,
    member_count: 16,
  },
  {
    gathering_id: 102,
    round: 1,
    gathering_time: '10:55',
    round_start_time: null,
    gathering_spot_id: 2,
    gathering_spot_name: '出入口②',
    gathering_spot_image_key: null,
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
    // 保存後のレスポンス用。版の既定は0。
    findById: vi.fn().mockResolvedValue({
      event_id: EVENT_ID,
      event_name: '競技',
      rule_text: null,
      start_time: '0900',
      end_time: '0930',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      lock_version: 0,
    }),
    findWithVenuesById: vi.fn(),
    findByParticipantUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hasGatherings: vi.fn(),
    findImageKey: vi.fn().mockResolvedValue({ imageKey: null }),
    replaceImageKey: vi.fn(),
  };
  const repository: IEventGatheringSettingsRepository = {
    // 1回目は差分計算用、2回目は保存後のレスポンス用
    findByEventId: vi.fn().mockResolvedValue(current),
    apply: options.applyError
      ? vi.fn().mockRejectedValue(options.applyError)
      : vi.fn().mockResolvedValue(true),
  };
  const gatheringNotificationGeneratorService: IGatheringNotificationGeneratorService =
    {
      generate: vi.fn().mockResolvedValue('created'),
      reconcileAll: vi.fn().mockResolvedValue({
        processed_count: 0,
        failed_gathering_ids: [],
      }),
    };
  const service = createEventGatheringSettingsService(
    eventRepository,
    gatheringSpotRepository,
    repository,
    { sign: async (key: string) => `https://signed.example/${key}` },
    gatheringNotificationGeneratorService
  );
  return {
    service,
    eventRepository,
    gatheringSpotRepository,
    repository,
    gatheringNotificationGeneratorService,
  };
}

describe('EventGatheringSettingsService', () => {
  it('通知生成に失敗しても保存済み集合の画像URLを返し、残りの通知同期を続ける', async () => {
    const current = existing.map(gathering => ({
      ...gathering,
      gathering_spot_image_key: `gathering-spots/${gathering.gathering_spot_id}/image.png`,
    }));
    const { service, repository, gatheringNotificationGeneratorService } =
      setup({ current });
    vi.mocked(
      gatheringNotificationGeneratorService.generate
    ).mockRejectedValueOnce(new Error('通知生成の一時障害'));
    const saved = await service.saveEventGatheringSettings({
      event_id: EVENT_ID,
      rounds: [
        {
          round: 1,
          gatherings: current.map(gathering => ({
            gathering_id: gathering.gathering_id,
            gathering_time:
              gathering.gathering_id === 101
                ? '11:00'
                : gathering.gathering_time,
            gathering_spot_id: gathering.gathering_spot_id,
          })),
        },
      ],
    });
    expect(repository.apply).toHaveBeenCalledWith(
      {
        event_id: EVENT_ID,
        creates: [],
        updates: [
          {
            gathering_id: 101,
            round: 1,
            round_start_time: null,
            gathering_time: '11:00',
            gathering_spot_id: 1,
          },
        ],
        delete_ids: [],
      },
      { holdNotificationSyncGatheringIds: [101] }
    );
    expect(
      gatheringNotificationGeneratorService.generate
    ).toHaveBeenCalledTimes(2);
    expect(
      saved.rounds[0].gatherings.map(
        gathering => gathering.gathering_spot.image_url
      )
    ).toEqual([
      'https://signed.example/gathering-spots/1/image.png',
      'https://signed.example/gathering-spots/2/image.png',
    ]);
  });

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
        creates: [
          {
            round: 2,
            round_start_time: null,
            gathering_time: '11:00',
            gathering_spot_id: 3,
          },
        ],
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

      expect(repository.apply).toHaveBeenCalledWith(
        {
          event_id: EVENT_ID,
          creates: [],
          updates: [
            {
              gathering_id: 101,
              round: 2,
              round_start_time: null,
              gathering_time: '10:45',
              gathering_spot_id: 1,
            },
            {
              gathering_id: 102,
              round: 2,
              round_start_time: null,
              gathering_time: '11:00',
              gathering_spot_id: 2,
            },
          ],
          delete_ids: [],
        },
        { holdNotificationSyncGatheringIds: [102] }
      );
    });

    // 変更のない行まで更新すると updated_at だけが進む。
    it('内容が変わらない集合予定は更新に含めない', async () => {
      const { service, repository } = setup();

      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 1,
            start_time: null,
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

  describe('楽観ロック', () => {
    const unchangedRounds = [
      {
        round: 1,
        gatherings: existing.map(gathering => ({
          gathering_id: gathering.gathering_id,
          gathering_time: gathering.gathering_time,
          gathering_spot_id: gathering.gathering_spot_id,
        })),
      },
    ];
    const changedRounds = [
      {
        round: 1,
        gatherings: [
          { gathering_id: 101, gathering_time: '11:00', gathering_spot_id: 1 },
          { gathering_id: 102, gathering_time: '10:55', gathering_spot_id: 2 },
        ],
      },
    ];

    it('取得時点と版が違えば何も確認・保存せず Event update conflict', async () => {
      const { service, repository, eventRepository, gatheringSpotRepository } =
        setup();
      vi.mocked(eventRepository.findById).mockResolvedValue({
        event_id: EVENT_ID,
        event_name: '競技',
        rule_text: null,
        start_time: '0900',
        end_time: '0930',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        lock_version: 5,
      });

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: changedRounds,
          lock_version: 4,
        })
      ).rejects.toThrow('Event update conflict');
      expect(gatheringSpotRepository.findExistingIds).not.toHaveBeenCalled();
      expect(repository.apply).not.toHaveBeenCalled();
    });

    it('版が一致すれば expectedLockVersion を付けて保存する', async () => {
      const { service, repository } = setup();

      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: changedRounds,
        lock_version: 0,
      });

      expect(repository.apply).toHaveBeenCalledWith(expect.anything(), {
        holdNotificationSyncGatheringIds: [101],
        expectedLockVersion: 0,
      });
    });

    it('版を指定しない保存は、版を確認せず従来どおり changeSet だけで保存する', async () => {
      const { service, repository } = setup();

      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: unchangedRounds,
      });

      expect(repository.apply).toHaveBeenCalledWith(expect.anything());
    });

    it('確認後に版が変わって保存が0件なら、Eventが残っていれば Event update conflict', async () => {
      const { service, repository } = setup();
      vi.mocked(repository.apply).mockResolvedValue(false);

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: changedRounds,
          lock_version: 0,
        })
      ).rejects.toThrow('Event update conflict');
    });

    it('確認後にEventが消えて保存が0件なら Event not found', async () => {
      const { service, repository, eventRepository } = setup();
      vi.mocked(repository.apply).mockResolvedValue(false);
      vi.mocked(eventRepository.exists)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: changedRounds,
          lock_version: 0,
        })
      ).rejects.toThrow('Event not found');
    });

    it('保存後のEventの lock_version をレスポンスに含める', async () => {
      const { service, eventRepository } = setup();
      vi.mocked(eventRepository.findById).mockResolvedValue({
        event_id: EVENT_ID,
        event_name: '競技',
        rule_text: null,
        start_time: '0900',
        end_time: '0930',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        lock_version: 7,
      });

      const result = await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: changedRounds,
      });

      expect(result.lock_version).toBe(7);
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

  it('ラウンドの開始時刻を全集合に保存し、省略した旧入力は既存値を維持する', async () => {
    const current = existing.map(gathering => ({
      ...gathering,
      round_start_time: '1100',
    }));
    const { service, repository } = setup({ current });
    const gatherings = current.map(g => ({
      gathering_id: g.gathering_id,
      gathering_time: g.gathering_time,
      gathering_spot_id: g.gathering_spot_id,
    }));
    await service.saveEventGatheringSettings({
      event_id: EVENT_ID,
      rounds: [{ round: 1, gatherings }],
    });
    expect(vi.mocked(repository.apply).mock.calls[0][0].updates).toEqual([]);
    await service.saveEventGatheringSettings({
      event_id: EVENT_ID,
      rounds: [{ round: 1, start_time: '1130', gatherings }],
    });
    expect(
      vi
        .mocked(repository.apply)
        .mock.calls[1][0].updates.map(g => g.round_start_time)
    ).toEqual(['1130', '1130']);
    await service.saveEventGatheringSettings({
      event_id: EVENT_ID,
      rounds: [{ round: 1, start_time: null, gatherings }],
    });
    expect(
      vi
        .mocked(repository.apply)
        .mock.calls[2][0].updates.map(g => g.round_start_time)
    ).toEqual([null, null]);
  });

  describe('保存後のレスポンス', () => {
    it('保存後に再取得した一覧をRound単位に束ねて返す', async () => {
      const saved: EventGatheringEntity[] = [
        { ...existing[0], round: 1 },
        { ...existing[1], round: 1 },
        {
          gathering_id: 103,
          round: 2,
          round_start_time: null,
          gathering_time: '11:00',
          gathering_spot_id: 3,
          gathering_spot_name: '出入口③',
          gathering_spot_image_key: null,
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
            start_time: null,
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
        lock_version: 0,
        rounds: [
          {
            round: 1,
            start_time: null,
            gatherings: [
              {
                gathering_id: 101,
                gathering_time: '10:45',
                gathering_spot: {
                  gathering_spot_id: 1,
                  gathering_spot_name: '出入口①',
                  image_url: null,
                },
                member_count: 16,
              },
              {
                gathering_id: 102,
                gathering_time: '10:55',
                gathering_spot: {
                  gathering_spot_id: 2,
                  gathering_spot_name: '出入口②',
                  image_url: null,
                },
                member_count: 0,
              },
            ],
          },
          {
            round: 2,
            start_time: null,
            gatherings: [
              {
                gathering_id: 103,
                gathering_time: '11:00',
                gathering_spot: {
                  gathering_spot_id: 3,
                  gathering_spot_name: '出入口③',
                  image_url: null,
                },
                member_count: 0,
              },
            ],
          },
        ],
      });
      expect(repository.findByEventId).toHaveBeenCalledTimes(2);
    });

    it('保存後に現在のGathering IDだけをGeneratorへ渡し、メンバー数に関係なく処理する', async () => {
      const { service, gatheringNotificationGeneratorService } = setup({
        current: [existing[1]],
      });

      await service.saveEventGatheringSettings({
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
      });

      expect(
        gatheringNotificationGeneratorService.generate
      ).toHaveBeenCalledTimes(1);
      expect(
        gatheringNotificationGeneratorService.generate
      ).toHaveBeenCalledWith(102);
    });

    it('新規作成したGathering IDを保存後にGeneratorへ渡す', async () => {
      const created: EventGatheringEntity = {
        ...existing[1],
        gathering_id: 103,
        round: 1,
        gathering_time: '11:00',
        gathering_spot_id: 3,
        gathering_spot_name: '出入口③',
        member_count: 0,
      };
      const { service, repository, gatheringNotificationGeneratorService } =
        setup({ current: [] });
      vi.mocked(repository.findByEventId)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([created]);

      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 1,
            gatherings: [{ gathering_time: '11:00', gathering_spot_id: 3 }],
          },
        ],
      });

      expect(
        gatheringNotificationGeneratorService.generate
      ).toHaveBeenCalledWith(103);
    });

    it('一部の通知生成が失敗しても集合設定保存は成功し、残りのGeneratorも実行する', async () => {
      const { service, repository, gatheringNotificationGeneratorService } =
        setup();
      const updated = existing.map(gathering =>
        gathering.gathering_id === 101
          ? { ...gathering, gathering_time: '10:46' }
          : gathering
      );
      vi.mocked(repository.findByEventId)
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(updated);
      vi.mocked(gatheringNotificationGeneratorService.generate)
        .mockRejectedValueOnce(new Error('通知生成に失敗しました'))
        .mockResolvedValueOnce('already_exists');

      await expect(
        service.saveEventGatheringSettings({
          event_id: EVENT_ID,
          rounds: [
            {
              round: 1,
              gatherings: [
                {
                  gathering_id: 101,
                  gathering_time: '10:46',
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
        })
      ).resolves.toMatchObject({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 1,
            gatherings: [
              {
                gathering_id: 101,
                gathering_time: '10:46',
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
        ],
      });

      expect(repository.apply).toHaveBeenCalledTimes(1);
      expect(
        gatheringNotificationGeneratorService.generate
      ).toHaveBeenCalledTimes(2);
      expect(
        gatheringNotificationGeneratorService.generate
      ).toHaveBeenNthCalledWith(1, 101);
      expect(
        gatheringNotificationGeneratorService.generate
      ).toHaveBeenNthCalledWith(2, 102);
    });
  });
});

describe('開始時刻省略時のラウンド整合性', () => {
  it('追加した集合にもラウンドの既存開始時刻を保存する', async () => {
    const current = existing.map(g => ({
      ...g,
      member_count: 0,
      round_start_time: '0900',
    }));
    const { service, repository } = setup({ current });
    await service.saveEventGatheringSettings({
      event_id: EVENT_ID,
      rounds: [
        {
          round: 1,
          gatherings: [
            ...current.map(g => ({
              gathering_id: g.gathering_id,
              gathering_time: g.gathering_time,
              gathering_spot_id: g.gathering_spot_id,
            })),
            { gathering_time: '09:30', gathering_spot_id: 3 },
          ],
        },
      ],
    });
    expect(
      vi.mocked(repository.apply).mock.calls[0][0].creates[0].round_start_time
    ).toBe('0900');
  });
  it.each([null, '1100'])(
    '移動元の開始時刻を引き継がず移動先の%sを全集合へ保存する',
    async destination => {
      const current = [
        { ...existing[0], member_count: 0, round_start_time: '0900' },
        { ...existing[1], round: 2, round_start_time: destination },
      ];
      const { service, repository } = setup({ current });
      await service.saveEventGatheringSettings({
        event_id: EVENT_ID,
        rounds: [
          {
            round: 2,
            gatherings: current.map(g => ({
              gathering_id: g.gathering_id,
              gathering_time: g.gathering_time,
              gathering_spot_id: g.gathering_spot_id,
            })),
          },
        ],
      });
      expect(vi.mocked(repository.apply).mock.calls[0][0].updates).toEqual([
        expect.objectContaining({
          gathering_id: 101,
          round: 2,
          round_start_time: destination,
        }),
      ]);
    }
  );
});
