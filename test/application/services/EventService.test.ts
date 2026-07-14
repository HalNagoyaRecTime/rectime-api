import { describe, expect, it, vi } from 'vitest';
import { createEventService } from '../../../src/application/services/EventService';
import type { IEventRepository } from '../../../src/domain/interfaces/repositories/IEventRepository';
import type { EventEntity } from '../../../src/domain/entities/Event';

function buildEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    f_event_id: 1,
    f_event_code: 'E001',
    f_event_name: '開会式',
    f_time: '0900',
    f_duration: '20',
    f_place: '体育館',
    f_gather_time: '0850',
    f_summary: null,
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
        findByEventCode: vi.fn(),
      };
      const service = createEventService(repository);

      const result = await service.getAllEvents({
        eventCode: 'E001',
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({ events, total: 1 });
      expect(repository.findAll).toHaveBeenCalledWith({
        eventCode: 'E001',
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getEventById', () => {
    it('存在する場合は EventEntity を返す', async () => {
      const event = buildEvent();
      const repository: IEventRepository = {
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(event),
        findByEventCode: vi.fn(),
      };
      const service = createEventService(repository);

      await expect(service.getEventById(1)).resolves.toEqual(event);
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository: IEventRepository = {
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
        findByEventCode: vi.fn(),
      };
      const service = createEventService(repository);

      await expect(service.getEventById(999)).rejects.toThrow(
        'Event not found'
      );
    });
  });
});
