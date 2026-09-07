import type {
  EventNotificationSummary,
  EventScheduleResult,
  UpdateEventScheduleInput,
} from '../../domain/entities/EventSchedule';

export interface IEventScheduleService {
  updateEventSchedule: (
    input: UpdateEventScheduleInput
  ) => Promise<EventScheduleResult>;
  getEventNotificationSummary: (
    eventId: number
  ) => Promise<EventNotificationSummary>;
}
