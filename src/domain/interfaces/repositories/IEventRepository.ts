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
  findById: (id: number) => Promise<EventEntity | null>;
  findWithVenuesById: (id: number) => Promise<EventWithVenuesEntity | null>;
  findByParticipantUserId: (userId: number) => Promise<EventWithVenuesEntity[]>;
  create: (event: EventWriteInput) => Promise<EventWithVenuesEntity>;
  update: (
    id: number,
    event: EventWriteInput
  ) => Promise<EventWithVenuesEntity | null>;
  delete: (id: number) => Promise<boolean>;
  hasReferences: (id: number) => Promise<boolean>;
}
