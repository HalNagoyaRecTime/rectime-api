import { EventEntity } from '../../entities/Event';

export interface IEventRepository {
  findAll: (options: {
    eventCode?: string;
    time?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ events: EventEntity[]; total: number }>;
  findByIdWithEntryCount: (id: number) => Promise<EventEntity | null>;
  findById: (id: number) => Promise<EventEntity | null>;
  findByEventCode: (eventCode: string) => Promise<EventEntity | null>;
}
