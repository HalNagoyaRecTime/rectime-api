import { describe, expect, it, vi } from 'vitest';
import { createEventService } from '../../../src/application/services/EventService';
import type { IEventGatheringSettingsRepository } from '../../../src/domain/interfaces/repositories/IEventGatheringSettingsRepository';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { EventEntity } from '../../../src/domain/entities/Event';
import type { EventGatheringEntity } from '../../../src/domain/entities/EventGathering';

function buildEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    event_id: 1,
    event_name: '開会式',
    rule_text: null,
    venue: '体育館',
    start_time: '0900',
    end_time: '0930',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

function buildGathering(
  overrides: Partial<EventGatheringEntity> & { gathering_id: number }
): EventGatheringEntity {
  return {
    round: 1,
    gathering_time: '10:45',
    gathering_spot_id: 1,
    gathering_spot_name: '出入口①',
    member_count: 0,
    ...overrides,
  };
}

function createRepository(
  overrides: Partial<IEventRepository> = {}
): IEventRepository {
  return {
    exists: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    findByParticipantUserId: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    hasReferences: vi.fn(),
    ...overrides,
  };
}

function createGatheringSettingsRepository(
  gatherings: EventGatheringEntity[] = []
): IEventGatheringSettingsRepository {
  return {
    findByEventId: vi.fn().mockResolvedValue(gatherings),
    apply: vi.fn(),
  };
}

function createService(
  repository: IEventRepository,
  gatheringSettingsRepository = createGatheringSettingsRepository()
) {
  return createEventService(repository, gatheringSettingsRepository);
}

describe('EventService', () => {
  describe('getAllEvents', () => {
    it('EntityをレスポンスDTOへ変換し、既定のページング値を返す', async () => {
      const events = [buildEvent()];
      const repository = createRepository({
        findAll: vi.fn().mockResolvedValue({ events, total: 1 }),
      });
      const service = createService(repository);

      const result = await service.getAllEvents({
        start_time: '0900',
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({ events, total: 1, limit: 10, offset: 0 });
      expect(repository.findAll).toHaveBeenCalledWith({
        startTime: '0900',
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getEventById', () => {
    it('集合予定が無い場合も既存fieldをそのまま返し、roundsは空配列にする', async () => {
      const event = buildEvent();
      const repository = createRepository({
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(event),
      });
      const service = createService(repository);

      await expect(service.getEventById(1)).resolves.toEqual({
        ...event,
        rounds: [],
      });
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('集合予定をRound単位にまとめて返す', async () => {
      const event = buildEvent();
      const gatheringSettingsRepository = createGatheringSettingsRepository([
        buildGathering({ gathering_id: 101, round: 1, member_count: 16 }),
        buildGathering({
          gathering_id: 102,
          round: 1,
          gathering_time: '11:00',
          gathering_spot_id: 2,
          gathering_spot_name: '出入口②',
          member_count: 8,
        }),
        buildGathering({
          gathering_id: 103,
          round: 2,
          gathering_time: '12:00',
        }),
      ]);
      const service = createService(
        createRepository({ findById: vi.fn().mockResolvedValue(event) }),
        gatheringSettingsRepository
      );

      const result = await service.getEventById(1);

      expect(result.rounds).toEqual([
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
              gathering_time: '11:00',
              gathering_spot: {
                gathering_spot_id: 2,
                gathering_spot_name: '出入口②',
              },
              member_count: 8,
            },
          ],
        },
        {
          round: 2,
          gatherings: [
            {
              gathering_id: 103,
              gathering_time: '12:00',
              gathering_spot: {
                gathering_spot_id: 1,
                gathering_spot_name: '出入口①',
              },
              member_count: 0,
            },
          ],
        },
      ]);
      expect(gatheringSettingsRepository.findByEventId).toHaveBeenCalledWith(1);
    });

    it('集合予定はEvent単位で1回だけ取得する', async () => {
      const gatheringSettingsRepository = createGatheringSettingsRepository([
        buildGathering({ gathering_id: 101 }),
        buildGathering({ gathering_id: 102, gathering_time: '11:00' }),
      ]);
      const service = createService(
        createRepository({ findById: vi.fn().mockResolvedValue(buildEvent()) }),
        gatheringSettingsRepository
      );

      await service.getEventById(1);

      expect(gatheringSettingsRepository.findByEventId).toHaveBeenCalledTimes(
        1
      );
    });

    it('存在しない場合はエラーを投げ、集合予定は取得しない', async () => {
      const repository = createRepository({
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      });
      const gatheringSettingsRepository = createGatheringSettingsRepository();

      await expect(
        createEventService(
          repository,
          gatheringSettingsRepository
        ).getEventById(999)
      ).rejects.toThrow('Event not found');
      expect(gatheringSettingsRepository.findByEventId).not.toHaveBeenCalled();
    });
  });

  describe('getMyEvents', () => {
    it('指定したuserIdが参加するイベントをDTOへ変換して返す', async () => {
      const events = [buildEvent()];
      const repository = createRepository({
        findByParticipantUserId: vi.fn().mockResolvedValue(events),
      });
      const service = createService(repository);

      await expect(service.getMyEvents(7)).resolves.toEqual(events);
      expect(repository.findByParticipantUserId).toHaveBeenCalledWith(7);
    });
  });

  describe('createEvent', () => {
    it('リクエストDTOをDomain入力型へ変換して作成する', async () => {
      const event = buildEvent();
      const repository = createRepository({
        create: vi.fn().mockResolvedValue(event),
      });

      await expect(
        createService(repository).createEvent({
          event_name: '開会式',
          rule_text: null,
          venue: '体育館',
          start_time: '0900',
          end_time: '0930',
        })
      ).resolves.toEqual(event);

      expect(repository.create).toHaveBeenCalledWith({
        name: '開会式',
        ruleText: null,
        venue: '体育館',
        startTime: '0900',
        endTime: '0930',
      });
    });
  });

  describe('deleteEvent', () => {
    it('参照中のイベントは削除せず409用のエラーを投げる', async () => {
      const repository = createRepository({
        hasReferences: vi.fn().mockResolvedValue(true),
      });

      await expect(createService(repository).deleteEvent(1)).rejects.toThrow(
        'Event is in use'
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('削除時のFK制約違反は409用のEvent is in useへ変換する', async () => {
      const repository = createRepository({
        hasReferences: vi.fn().mockResolvedValue(false),
        delete: vi
          .fn()
          .mockRejectedValue(
            new Error('D1_ERROR: FOREIGN KEY constraint failed')
          ),
      });

      await expect(createService(repository).deleteEvent(1)).rejects.toThrow(
        'Event is in use'
      );
    });

    it('存在しないイベントの削除はEvent not foundを投げる', async () => {
      const repository = createRepository({
        hasReferences: vi.fn().mockResolvedValue(false),
        delete: vi.fn().mockResolvedValue(false),
      });

      await expect(createService(repository).deleteEvent(1)).rejects.toThrow(
        'Event not found'
      );
    });
  });
});
