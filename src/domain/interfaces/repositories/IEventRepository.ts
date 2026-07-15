import { EventEntity } from '../../entities/Event';

export interface IEventRepository {
  findAll: (options: {
    startTime?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ events: EventEntity[]; total: number }>;
  findById: (id: number) => Promise<EventEntity | null>;
}
