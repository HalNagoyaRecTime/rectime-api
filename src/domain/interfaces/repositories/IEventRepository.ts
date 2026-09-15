import {
  EventEntity,
  EventListOptions,
  EventWithGatheringSummaryEntity,
  EventWriteInput,
} from '../../entities/Event';

export interface IEventRepository {
  exists: (id: number) => Promise<boolean>;
  findAll: (
    options: EventListOptions
  ) => Promise<{ events: EventWithGatheringSummaryEntity[]; total: number }>;
  findById: (id: number) => Promise<EventEntity | null>;
  findByParticipantUserId: (userId: number) => Promise<EventEntity[]>;
  create: (event: EventWriteInput) => Promise<EventEntity>;
  delete: (id: number) => Promise<boolean>;
  hasReferences: (id: number) => Promise<boolean>;
}
