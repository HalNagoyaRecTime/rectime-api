import {
  EntryEntity,
  EntryRepositoryFunctions,
  EntryServiceFunctions,
} from '../types';

export function createEntryService(
  entryRepository: EntryRepositoryFunctions
): EntryServiceFunctions {
  return {
    async getAllEntries(options: {
      f_student_id?: number;
      f_event_id?: number;
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