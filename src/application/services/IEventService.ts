import {
  EventEntity,
  EventInformationEntity,
} from '../../domain/entities/Event';

export interface IEventService {
  getAllEvents: (options: {
    eventCode?: string;
    time?: string;
    limit?: number;
    offset?: number;
  }) => Promise<{ events: EventEntity[]; total: number }>;
  getEventById: (id: number) => Promise<EventEntity>;
  getEventInformation: () => Promise<EventInformationEntity[]>;
}
