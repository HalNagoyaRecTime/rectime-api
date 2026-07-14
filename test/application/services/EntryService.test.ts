import { describe, expect, it, vi } from 'vitest';
import { createEntryService } from '../../../src/application/services/EntryService';
import type { IEntryRepository } from '../../../src/domain/interfaces/repositories/IEntryRepository';
import type { EntryEntity } from '../../../src/domain/entities/Entry';

describe('EntryService', () => {
  describe('getAllEntries', () => {
    it('リポジトリの結果をそのまま返す', async () => {
      const entries: EntryEntity[] = [
        { f_entry_id: 1, f_student_id: 10, f_event_id: 100 },
      ];
      const repository: IEntryRepository = {
        findAll: vi.fn().mockResolvedValue({ entries, total: 1 }),
        findById: vi.fn(),
      };
      const service = createEntryService(repository);

      const result = await service.getAllEntries({
        studentId: 10,
        limit: 20,
        offset: 0,
      });

      expect(result).toEqual({ entries, total: 1 });
      expect(repository.findAll).toHaveBeenCalledWith({
        studentId: 10,
        limit: 20,
        offset: 0,
      });
    });
  });

  describe('getEntryById', () => {
    it('存在する場合は EntryEntity を返す', async () => {
      const entry: EntryEntity = {
        f_entry_id: 1,
        f_student_id: 10,
        f_event_id: 100,
      };
      const repository: IEntryRepository = {
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(entry),
      };
      const service = createEntryService(repository);

      await expect(service.getEntryById(1)).resolves.toEqual(entry);
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository: IEntryRepository = {
        findAll: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      };
      const service = createEntryService(repository);

      await expect(service.getEntryById(999)).rejects.toThrow(
        'Entry not found'
      );
    });
  });
});
