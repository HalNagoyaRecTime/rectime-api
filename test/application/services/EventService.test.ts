import { describe, expect, it, vi } from 'vitest';
import { createEventService } from '../../../src/application/services/EventService';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { EventEntity } from '../../../src/domain/entities/Event';

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

function createRepository(
  overrides: Partial<IEventRepository> = {}
): IEventRepository {
  return {
    exists: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    hasReferences: vi.fn(),
    ...overrides,
  };
}

describe('EventService', () => {
  describe('getAllEvents', () => {
    it('EntityをレスポンスDTOへ変換し、既定のページング値を返す', async () => {
      const events = [buildEvent()];
      const repository = createRepository({
        findAll: vi.fn().mockResolvedValue({ events, total: 1 }),
      });
      const service = createEventService(repository);

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
    it('存在する場合はEventDTOを返す', async () => {
      const event = buildEvent();
      const repository = createRepository({
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(event),
      });
      const service = createEventService(repository);

      await expect(service.getEventById(1)).resolves.toEqual(event);
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository = createRepository({
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      });

      await expect(
        createEventService(repository).getEventById(999)
      ).rejects.toThrow('Event not found');
    });
  });

  describe('createEvent', () => {
    it('リクエストDTOをDomain入力型へ変換して作成する', async () => {
      const event = buildEvent();
      const repository = createRepository({
        create: vi.fn().mockResolvedValue(event),
      });

      await expect(
        createEventService(repository).createEvent({
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

      await expect(
        createEventService(repository).deleteEvent(1)
      ).rejects.toThrow('Event is in use');
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

      await expect(
        createEventService(repository).deleteEvent(1)
      ).rejects.toThrow('Event is in use');
    });

    it('存在しないイベントの削除はEvent not foundを投げる', async () => {
      const repository = createRepository({
        hasReferences: vi.fn().mockResolvedValue(false),
        delete: vi.fn().mockResolvedValue(false),
      });

      await expect(
        createEventService(repository).deleteEvent(1)
      ).rejects.toThrow('Event not found');
    });
  });
});
