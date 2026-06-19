import { EntryEntity } from '../../domain/entities/Entry';
import { IEntryService } from './IEntryService';
import { IEntryRepository } from '../../domain/interfaces/repositories/IEntryRepository';

export function createEntryService(
  entryRepository: IEntryRepository
): IEntryService {
  return {
    async getAllEntries(options: {
      studentId?: number;
      eventId?: number;
      limit?: number;
      offset?: number;
    }): Promise<{ entries: EntryEntity[]; total: number }> {
      return await entryRepository.findAll(options);
    },

    async getEntryById(id: number): Promise<EntryEntity> {
      const entry = await entryRepository.findById(id);
      if (!entry) {
        throw new Error('Entry not found');
      }
      return entry;
    },
  };
}
