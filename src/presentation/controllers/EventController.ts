import { Context } from 'hono';
import { IEventService } from '../../application/services/IEventService';
import {
  eventIdParams,
  eventListQuery,
  type EventListResponseDTO,
  type EventResponseDTO,
} from '../openapi/events';

export function createEventController(eventService: IEventService) {
  const getAllEvents = async (c: Context) => {
    try {
      const parsedQuery = eventListQuery.safeParse(c.req.query());
      if (!parsedQuery.success) {
        return c.json({ error: 'Invalid event query' }, 400);
      }
      const { start_time: startTime, limit, offset } = parsedQuery.data;

      const result = await eventService.getAllEvents({
        startTime,
        limit,
        offset,
      });

      const response: EventListResponseDTO = {
        events: result.events,
        total: result.total,
        limit: limit ?? 50,
        offset: offset ?? 0,
      };

      return c.json(response, 200);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch events',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const getEventById = async (c: Context) => {
    try {
      const parsedParams = eventIdParams.safeParse({
        eventId: c.req.param('eventId'),
      });
      if (!parsedParams.success) {
        return c.json(
          { error: 'Invalid event ID', code: 'INVALID_EVENT_ID' },
          400
        );
      }
      const id = Number(parsedParams.data.eventId);

      const event: EventResponseDTO = await eventService.getEventById(id);
      return c.json(event, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return c.json(
          { error: 'Event not found', code: 'EVENT_NOT_FOUND' },
          404
        );
      }
      return c.json(
        {
          error: 'Failed to fetch event',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return {
    getAllEvents,
    getEventById,
  };
}
