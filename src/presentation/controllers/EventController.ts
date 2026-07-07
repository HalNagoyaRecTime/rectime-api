import { Context } from 'hono';
import { IEventService } from '../../application/services/IEventService';

export function createEventController(eventService: IEventService) {
  const getAllEvents = async (c: Context) => {
    try {
      const eventCode = c.req.query('f_event_code');
      const time = c.req.query('f_time');
      const limit = c.req.query('limit');
      const offset = c.req.query('offset');

      const result = await eventService.getAllEvents({
        eventCode,
        time,
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
      const eventIdParam = c.req.param('eventId');
      const id = Number(eventIdParam);

      if (!eventIdParam || Number.isNaN(id)) {
        return c.json(
          { error: 'Invalid event ID', code: 'INVALID_EVENT_ID' },
          400
        );
      }

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
  const getEventInformation = async (c: Context) => {
    try {
      const eventInfo = await eventService.getEventInformation();
      return c.json(eventInfo);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch event information',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return {
    getAllEvents,
    getEventById,
    getEventInformation,
  };
}
