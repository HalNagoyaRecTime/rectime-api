import {
  EventEntity,
  EventInformationEntity,
} from '../../domain/entities/Event';
import { IEventService } from './IEventService';
import { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';

export function createEventService(
  eventRepository: IEventRepository
): IEventService {
  return {
    async getAllEvents(options: {
      eventCode?: string;
      time?: string;
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
    async getEventInformation(): Promise<EventInformationEntity[]> {
      return await eventRepository.getEventInformation();
    },
  };
}
