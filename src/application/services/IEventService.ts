import type {
  CreateEventRequestDTO,
  EventDetailDTO,
  EventDTO,
  EventListResponseDTO,
  EventWithVenuesDTO,
  GetEventsRequestDTO,
  UpdateEventRequestDTO,
} from '../dto/EventDTO';

export interface IEventService {
  getAllEvents: (options: GetEventsRequestDTO) => Promise<EventListResponseDTO>;
  getEventById: (id: number) => Promise<EventDetailDTO>;
  getMyEvents: (userId: number) => Promise<EventWithVenuesDTO[]>;
  createEvent: (event: CreateEventRequestDTO) => Promise<EventDTO>;
  updateEvent: (id: number, event: UpdateEventRequestDTO) => Promise<EventDTO>;
  deleteEvent: (id: number) => Promise<void>;
}
