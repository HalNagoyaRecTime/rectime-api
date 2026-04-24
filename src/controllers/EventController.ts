import { Context } from 'hono';
import { EventControllerFunctions } from '../types/controllers';
import { EventServiceFunctions } from '../types/services';

export function createEventController(
  eventService: EventServiceFunctions
): EventControllerFunctions {
  const getAllEvents = async (c: Context) => {
    try {
      const f_event_code = c.req.query('f_event_code');
      const f_time = c.req.query('f_time');
      const limit = c.req.query('limit');
      const offset = c.req.query('offset');

      const result = await eventService.getAllEvents({
        f_event_code,
        f_time,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });

      return c.json({
        events: result.events,
        total: result.total,
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
      });
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
      const id = parseInt(c.req.param('eventId'));
      const event = await eventService.getEventById(id);
      return c.json(event);
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
