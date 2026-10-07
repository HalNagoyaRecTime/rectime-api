import { describe, expect, it, vi } from 'vitest';
import {
  createGatheringNotificationGeneratorService,
  createGatheringTimeSourceHash,
} from '../../../src/application/services/GatheringNotificationGeneratorService';
import type { INotificationCreationRepository } from '../../../src/domain/interfaces/repositories/INotificationCreationRepository';
import type { IGatheringNotificationGeneratorRepository } from '../../../src/domain/interfaces/repositories/IGatheringNotificationGeneratorRepository';
import { buildEventNotificationSendAt } from '../../../src/lib/eventDate';

describe('GatheringNotificationGeneratorService', () => {
  it('同じ集合時間は同じHashになり、正規化後の時刻変更でHashが変わる', async () => {
    await expect(createGatheringTimeSourceHash('10:45')).resolves.toBe(
      await createGatheringTimeSourceHash(' 10:45 ')
    );
    await expect(createGatheringTimeSourceHash('10:45')).resolves.not.toBe(
      await createGatheringTimeSourceHash('10:46')
    );
  });

  it('nullと時刻を異なるHashとして扱う', async () => {
    await expect(createGatheringTimeSourceHash(null)).resolves.not.toBe(
      await createGatheringTimeSourceHash('')
    );
  });

  it('集合日時からJSTの15分前を計算し、日付境界をまたぐ', () => {
    expect(buildEventNotificationSendAt('2026-11-07', '10:45')).toBe(
      '2026-11-07T01:30:00.000Z'
    );
    expect(buildEventNotificationSendAt('2026-11-07', '0010')).toBe(
      '2026-11-06T14:55:00.000Z'
    );
  });

  it('現在の集合時間からAudience付きのautomatic通知を作る', async () => {
    const gatheringRepository: IGatheringNotificationGeneratorRepository = {
      findGatheringTime: vi.fn().mockResolvedValue('10:45'),
      findConfiguredGatheringIds: vi.fn().mockResolvedValue([51]),
    };
    const notificationCreationRepository: INotificationCreationRepository = {
      create: vi.fn(),
      createOrUpdateAutomatic: vi.fn().mockResolvedValue({
        status: 'created',
        result: { notification_id: 12, notification_schedule_id: 34 },
      }),
    };
    const service = createGatheringNotificationGeneratorService(
      gatheringRepository,
      notificationCreationRepository,
      '2026-11-07',
      () => '2026-11-08T01:00:00.000Z'
    );

    await expect(service.generate(51)).resolves.toBe('created');
    expect(
      notificationCreationRepository.createOrUpdateAutomatic
    ).toHaveBeenCalledWith({
      created_by_user_id: null,
      scheduled_by_user_id: null,
      push_title: '集合時間のお知らせ',
      push_body: '集合時間は10:45です。',
      detail_title: '集合時間のお知らせ',
      detail_body: '集合時間は10:45です。',
      importance: 'normal',
      send_at: '2026-11-07T01:30:00.000Z',
      audiences: [{ type: 'gathering', target_id: 51 }],
      source: {
        type: 'gathering',
        id: 51,
        hash: await createGatheringTimeSourceHash('10:45'),
      },
      now: '2026-11-08T01:00:00.000Z',
      legacy_schedule: null,
    });
  });

  it('同一Hashの一意制約競合は既生成として返す', async () => {
    const gatheringRepository: IGatheringNotificationGeneratorRepository = {
      findGatheringTime: vi.fn().mockResolvedValue('10:45'),
      findConfiguredGatheringIds: vi.fn().mockResolvedValue([51]),
    };
    const notificationCreationRepository: INotificationCreationRepository = {
      create: vi.fn(),
      createOrUpdateAutomatic: vi
        .fn()
        .mockResolvedValue({ status: 'already_exists' }),
    };
    const service = createGatheringNotificationGeneratorService(
      gatheringRepository,
      notificationCreationRepository,
      '2026-11-07'
    );

    await expect(service.generate(51)).resolves.toBe('already_exists');
  });

  it('集合時間だけの編集でHashを変え、Gathering source IDは維持する', async () => {
    let gatheringTime = '10:45';
    const gatheringRepository: IGatheringNotificationGeneratorRepository = {
      findGatheringTime: vi.fn(async () => gatheringTime),
      findConfiguredGatheringIds: vi.fn().mockResolvedValue([51]),
    };
    let currentHash: string | null = null;
    const notificationCreationRepository: INotificationCreationRepository = {
      create: vi.fn(),
      createOrUpdateAutomatic: vi.fn(async command => {
        if (currentHash === command.source!.hash) {
          return { status: 'already_exists' } as const;
        }
        const status = currentHash === null ? 'created' : 'updated';
        currentHash = command.source!.hash;
        return {
          status,
          result: { notification_id: 12, notification_schedule_id: 34 },
        } as const;
      }),
    };
    const service = createGatheringNotificationGeneratorService(
      gatheringRepository,
      notificationCreationRepository,
      '2026-11-07',
      () => '2026-10-04T01:00:00.000Z'
    );

    await expect(service.generate(51)).resolves.toBe('created');
    await expect(service.generate(51)).resolves.toBe('already_exists');
    gatheringTime = '10:46';
    await expect(service.generate(51)).resolves.toBe('updated');

    const commands = vi.mocked(
      notificationCreationRepository.createOrUpdateAutomatic
    ).mock.calls;
    expect(commands.map(([command]) => command.source?.id)).toEqual([
      51, 51, 51,
    ]);
    expect(commands.map(([command]) => command.source?.hash)).toEqual([
      await createGatheringTimeSourceHash('10:45'),
      await createGatheringTimeSourceHash('10:45'),
      await createGatheringTimeSourceHash('10:46'),
    ]);
  });

  it('処理中に集合時間が変わった場合は最新値へ再同期する', async () => {
    const gatheringRepository: IGatheringNotificationGeneratorRepository = {
      findGatheringTime: vi
        .fn()
        .mockResolvedValueOnce('10:45')
        .mockResolvedValueOnce('11:00')
        .mockResolvedValueOnce('11:00')
        .mockResolvedValueOnce('11:00'),
      findConfiguredGatheringIds: vi.fn().mockResolvedValue([51]),
    };
    const notificationCreationRepository: INotificationCreationRepository = {
      create: vi.fn(),
      createOrUpdateAutomatic: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'created',
          result: { notification_id: 12, notification_schedule_id: 34 },
        })
        .mockResolvedValueOnce({
          status: 'updated',
          result: { notification_id: 12, notification_schedule_id: 34 },
        }),
    };
    const service = createGatheringNotificationGeneratorService(
      gatheringRepository,
      notificationCreationRepository,
      '2026-11-07',
      () => '2026-10-04T01:00:00.000Z'
    );

    await expect(service.generate(51)).resolves.toBe('updated');

    const commands = vi.mocked(
      notificationCreationRepository.createOrUpdateAutomatic
    ).mock.calls;
    expect(commands).toHaveLength(2);
    expect(commands[0][0]).toMatchObject({
      push_body: '集合時間は10:45です。',
      send_at: '2026-11-07T01:30:00.000Z',
    });
    expect(commands[1][0]).toMatchObject({
      push_body: '集合時間は11:00です。',
      send_at: '2026-11-07T01:45:00.000Z',
    });
  });

  it('定期再同期は全Gatheringを処理し、一時失敗を次回実行で回復する', async () => {
    const gatheringTimes = new Map([
      [51, '10:45'],
      [52, '11:00'],
    ]);
    const gatheringRepository: IGatheringNotificationGeneratorRepository = {
      findGatheringTime: vi.fn(async gatheringId => {
        return gatheringTimes.get(gatheringId) ?? null;
      }),
      findConfiguredGatheringIds: vi.fn().mockResolvedValue([51, 52]),
    };
    let failGathering52Once = true;
    const notificationCreationRepository: INotificationCreationRepository = {
      create: vi.fn(),
      createOrUpdateAutomatic: vi.fn(async command => {
        if (command.source?.id === 52 && failGathering52Once) {
          failGathering52Once = false;
          throw new Error('一時的な同期失敗');
        }
        return { status: 'already_exists' } as const;
      }),
    };
    const service = createGatheringNotificationGeneratorService(
      gatheringRepository,
      notificationCreationRepository,
      '2026-11-08',
      () => '2026-10-04T01:00:00.000Z'
    );

    await expect(service.reconcileAll()).resolves.toEqual({
      processed_count: 1,
      failed_gathering_ids: [52],
    });
    await expect(service.reconcileAll()).resolves.toEqual({
      processed_count: 2,
      failed_gathering_ids: [],
    });

    const commands = vi.mocked(
      notificationCreationRepository.createOrUpdateAutomatic
    ).mock.calls.map(([command]) => command);
    expect(commands.some(command => command.source?.id === 51)).toBe(true);
    expect(commands.some(command => command.source?.id === 52)).toBe(true);
    expect(
      commands.find(command => command.source?.id === 51)?.send_at
    ).toBe('2026-11-08T01:30:00.000Z');
    expect(
      commands.find(command => command.source?.id === 52)?.send_at
    ).toBe('2026-11-08T01:45:00.000Z');
  });

  it('Gatheringが見つからない場合は通知を作らない', async () => {
    const gatheringRepository: IGatheringNotificationGeneratorRepository = {
      findGatheringTime: vi.fn().mockResolvedValue(null),
      findConfiguredGatheringIds: vi.fn().mockResolvedValue([]),
    };
    const notificationCreationRepository: INotificationCreationRepository = {
      create: vi.fn(),
      createOrUpdateAutomatic: vi.fn(),
    };
    const service = createGatheringNotificationGeneratorService(
      gatheringRepository,
      notificationCreationRepository
    );

    await expect(service.generate(51)).resolves.toBe('not_found');
    expect(notificationCreationRepository.create).not.toHaveBeenCalled();
  });

  it('EVENT_DATEが未設定または不正なら通知を作らない', async () => {
    const gatheringRepository: IGatheringNotificationGeneratorRepository = {
      findGatheringTime: vi.fn().mockResolvedValue('10:45'),
      findConfiguredGatheringIds: vi.fn().mockResolvedValue([51]),
    };
    const notificationCreationRepository: INotificationCreationRepository = {
      create: vi.fn(),
      createOrUpdateAutomatic: vi.fn(),
    };
    const missingDateService = createGatheringNotificationGeneratorService(
      gatheringRepository,
      notificationCreationRepository
    );
    const invalidDateService = createGatheringNotificationGeneratorService(
      gatheringRepository,
      notificationCreationRepository,
      '2026-02-30'
    );

    await expect(missingDateService.generate(51)).rejects.toThrow(
      'EVENT_DATE must be configured'
    );
    await expect(invalidDateService.generate(51)).rejects.toThrow(
      'Invalid event date or start time'
    );
    expect(
      notificationCreationRepository.createOrUpdateAutomatic
    ).not.toHaveBeenCalled();
  });
});
