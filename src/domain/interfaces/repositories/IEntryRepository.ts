import { EntryEntity } from '../../entities/Entry';

export interface IEntryRepository {
  findAll: (options: {
    studentId?: number;
    eventId?: number;
    limit?: number;
    offset?: number;
  }) => Promise<{ entries: EntryEntity[]; total: number }>;
  findById: (id: number) => Promise<EntryEntity | null>;
}
