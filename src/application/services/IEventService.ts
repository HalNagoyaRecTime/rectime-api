import type {
  CreateEventRequestDTO,
  EventDetailDTO,
  EventDTO,
  EventListPageDTO,
  GetEventsRequestDTO,
  UpdateEventRequestDTO,
} from '../dto/EventDTO';

export interface IEventService {
  getAllEvents: (options: GetEventsRequestDTO) => Promise<EventListPageDTO>;
  getEventById: (id: number) => Promise<EventDetailDTO>;
  getMyEvents: (userId: number) => Promise<EventDTO[]>;
  createEvent: (event: CreateEventRequestDTO) => Promise<EventDTO>;
  updateEvent: (id: number, event: UpdateEventRequestDTO) => Promise<EventDTO>;
  deleteEvent: (id: number) => Promise<void>;
}
