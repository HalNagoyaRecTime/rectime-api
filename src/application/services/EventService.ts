import type {
  EventEntity,
  EventListOptions,
  EventWriteInput,
} from '../../domain/entities/Event';
import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import type {
  CreateEventRequestDTO,
  EventDTO,
  GetEventsRequestDTO,
} from '../dto/EventDTO';
import type { IEventService } from './IEventService';

function toEventDTO(event: EventEntity): EventDTO {
  return {
    event_id: event.event_id,
    event_name: event.event_name,
    rule_text: event.rule_text,
    venue: event.venue,
    start_time: event.start_time,
    end_time: event.end_time,
    created_at: event.created_at,
    updated_at: event.updated_at,
  };
}

function toEventWriteInput(event: CreateEventRequestDTO): EventWriteInput {
  return {
    name: event.event_name,
    ruleText: event.rule_text,
    venue: event.venue,
    startTime: event.start_time,
    endTime: event.end_time,
  };
}

function toEventListOptions(options: GetEventsRequestDTO): EventListOptions {
  return {
    startTime: options.start_time,
    limit: options.limit ?? 50,
    offset: options.offset ?? 0,
  };
}

export function createEventService(
  eventRepository: IEventRepository
): IEventService {
  return {
    async getAllEvents(options) {
      const repositoryOptions = toEventListOptions(options);
      const result = await eventRepository.findAll(repositoryOptions);
      return {
        events: result.events.map(toEventDTO),
        total: result.total,
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
      };
    },

    async getEventById(id) {
      const event = await eventRepository.findById(id);
      if (!event) {
        throw new Error('Event not found');
      }
      return toEventDTO(event);
    },
    async createEvent(event) {
      return toEventDTO(await eventRepository.create(toEventWriteInput(event)));
    },
    async deleteEvent(id: number): Promise<void> {
      if (await eventRepository.hasReferences(id)) {
        throw new Error('Event is in use');
      }
      let deleted: boolean;
      try {
        deleted = await eventRepository.delete(id);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('FOREIGN KEY constraint failed')
        ) {
          throw new Error('Event is in use');
        }
        throw error;
      }
      if (!deleted) {
        throw new Error('Event not found');
      }
    },
  };
}
