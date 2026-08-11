import type {
  CreateEventRequestDTO,
  EventDTO,
  EventListResponseDTO,
  GetEventsRequestDTO,
} from '../dto/EventDTO';

export interface IEventService {
  getAllEvents: (options: GetEventsRequestDTO) => Promise<EventListResponseDTO>;
  getEventById: (id: number) => Promise<EventDTO>;
  createEvent: (event: CreateEventRequestDTO) => Promise<EventDTO>;
  deleteEvent: (id: number) => Promise<void>;
}
