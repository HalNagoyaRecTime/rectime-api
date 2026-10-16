import type {
  CreateEventRequestDTO,
  EventDetailDTO,
  EventDTO,
  MyEventDTO,
  EventListResponseDTO,
  GetEventsRequestDTO,
  UpdateEventRequestDTO,
} from '../dto/EventDTO';

export interface IEventService {
  getAllEvents: (options: GetEventsRequestDTO) => Promise<EventListResponseDTO>;
  getEventById: (id: number) => Promise<EventDetailDTO>;
  getMyEvents: (userId: number) => Promise<MyEventDTO[]>;
  createEvent: (event: CreateEventRequestDTO) => Promise<EventDTO>;
  updateEvent: (id: number, event: UpdateEventRequestDTO) => Promise<EventDTO>;
  deleteEvent: (id: number) => Promise<void>;
}
