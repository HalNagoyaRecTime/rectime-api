import type {
  EventScheduleResult,
  UpdateEventScheduleInput,
} from '../../domain/entities/EventSchedule';

export interface IEventScheduleService {
  updateEventSchedule: (
    input: UpdateEventScheduleInput
  ) => Promise<EventScheduleResult>;
}
