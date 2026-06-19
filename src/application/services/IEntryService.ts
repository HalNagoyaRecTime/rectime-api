import { EntryEntity } from '../../domain/entities/Entry';

export interface IEntryService {
  getAllEntries: (options: {
    studentId?: number;
    eventId?: number;
    limit?: number;
    offset?: number;
  }) => Promise<{ entries: EntryEntity[]; total: number }>;
  getEntryById: (id: number) => Promise<EntryEntity>;
}
