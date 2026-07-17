import { EventEntity } from '../../domain/entities/Event';

export interface IEventService {
  getAllEvents: (options: {
    startTime?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ events: EventEntity[]; total: number }>;
  getEventById: (id: number) => Promise<EventEntity>;
}
