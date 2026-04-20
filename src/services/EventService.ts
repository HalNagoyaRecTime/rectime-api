import {
  EventEntity,
  EventRepositoryFunctions,
  EventServiceFunctions,
} from '../types';

export function createEventService(
  eventRepository: EventRepositoryFunctions
): EventServiceFunctions {
  return {
    async getAllEvents(options: {
      f_event_code?: string;
      f_time?: string;
      limit?: number;
      offset?: number;
    }): Promise<{ events: EventEntity[]; total: number }> {
      return await eventRepository.findAll(options);
    },

    async getEventById(id: number): Promise<EventEntity> {
      const event = await eventRepository.findById(id);
      if (!event) {
        throw new Error('Event not found');
      }
      return event;
    },
  };
}