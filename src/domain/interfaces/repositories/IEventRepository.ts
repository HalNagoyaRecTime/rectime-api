import {
  EventEntity,
  EventListOptions,
  EventWithGatheringSummaryEntity,
  EventWithVenuesEntity,
  EventWriteInput,
} from '../../entities/Event';

export interface IEventRepository {
  exists: (id: number) => Promise<boolean>;
  findAll: (
    options: EventListOptions
  ) => Promise<{ events: EventWithGatheringSummaryEntity[]; total: number }>;
  findById: (id: number) => Promise<EventWithVenuesEntity | null>;
  findByParticipantUserId: (userId: number) => Promise<EventWithVenuesEntity[]>;
  create: (event: EventWriteInput) => Promise<EventEntity>;
  update: (id: number, event: EventWriteInput) => Promise<EventEntity | null>;
  delete: (id: number) => Promise<boolean>;
  hasReferences: (id: number) => Promise<boolean>;
}
