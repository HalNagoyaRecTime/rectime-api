import { EventEntity, UpdateEventTimesInput } from '../../entities/Event';

export interface IEventRepository {
  findAll: (options: {
    startTime?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ events: EventEntity[]; total: number }>;
  findById: (id: number) => Promise<EventEntity | null>;
  updateTimes: (
    id: number,
    input: UpdateEventTimesInput
  ) => Promise<EventEntity | null>;
}
