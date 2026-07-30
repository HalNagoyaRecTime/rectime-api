import {
  EventEntity,
  EventListOptions,
  EventWriteInput,
} from '../../entities/Event';

export interface IEventRepository {
  findAll: (
    options: EventListOptions
  ) => Promise<{ events: EventEntity[]; total: number }>;
  findById: (id: number) => Promise<EventEntity | null>;
  create: (event: EventWriteInput) => Promise<EventEntity>;
  update: (id: number, event: EventWriteInput) => Promise<EventEntity | null>;
  delete: (id: number) => Promise<boolean>;
  hasReferences: (id: number) => Promise<boolean>;
}
