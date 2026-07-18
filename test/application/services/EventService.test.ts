import { describe, expect, it, vi } from 'vitest';
import { createEventService } from '../../../src/application/services/EventService';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { EventEntity } from '../../../src/domain/entities/Event';

function buildEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    event_id: 1,
    user_id: -1,
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

describe('EventService', () => {
  describe('getAllEvents', () => {
    it('リポジトリの結果をそのまま返す', async () => {
      const events = [buildEvent()];
      const repository: IEventRepository = {
        findAll: vi.fn().mockResolvedValue({ events, total: 1 }),
        findById: vi.fn(),
      };
      const service = createEventService(repository);

      const result = await service.getAllEvents({
        startTime: '0900',
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({ events, total: 1 });
      expect(repository.findAll).toHaveBeenCalledWith({
        startTime: '0900',
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getEventById', () => {
    it('存在する場合はEventEntityを返す', async () => {
      const event = buildEvent();
      const repository: IEventRepository = {
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(event),
      };
      const service = createEventService(repository);

      await expect(service.getEventById(1)).resolves.toEqual(event);
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository: IEventRepository = {
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      };

      await expect(
        createEventService(repository).getEventById(999)
      ).rejects.toThrow('Event not found');
    });
  });
});
