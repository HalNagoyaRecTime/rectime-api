import { Context } from 'hono';
import { z } from 'zod';
import type { CreateEventRequestDTO } from '../../application/dto/EventDTO';
import type { IEventService } from '../../application/services/IEventService';

const eventIdSchema = z.coerce.number().int().positive();
const eventWriteSchema = z
  .object({
    event_name: z.string().trim().min(1).max(100),
    rule_text: z.string().trim().max(1000).nullable().optional(),
    venue: z.string().trim().min(1).max(100),
    start_time: z.string().regex(/^\d{4}$/),
    end_time: z.string().regex(/^\d{4}$/),
  })
  .refine(data => data.start_time < data.end_time, {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  });

export function createEventController(eventService: IEventService) {
  const getAllEvents = async (c: Context) => {
    try {
      const startTime = c.req.query('start_time');
      const limit = c.req.query('limit');
      const offset = c.req.query('offset');

      return c.json(
        await eventService.getAllEvents({
          start_time: startTime,
          limit: limit ? parseInt(limit) : undefined,
          offset: offset ? parseInt(offset) : undefined,
        })
      );
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
      const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
      if (!parsedId.success) {
        return c.json(
          { error: 'Invalid event ID', code: 'INVALID_EVENT_ID' },
          400
        );
      }

      const event = await eventService.getEventById(parsedId.data);
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

  const createEvent = async (c: Context) => {
    const parsed = await parseEventBody(c);
    if (!parsed.success) return parsed.response;
    try {
      return c.json(await eventService.createEvent(parsed.data), 201);
    } catch (error) {
      return c.json(
        { error: 'Failed to create event', details: String(error) },
        500
      );
    }
  };

  const updateEvent = async (c: Context) => {
    const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedId.success) return c.json({ error: 'Invalid event ID' }, 400);
    const parsed = await parseEventBody(c);
    if (!parsed.success) return parsed.response;
    try {
      return c.json(await eventService.updateEvent(parsedId.data, parsed.data));
    } catch (error) {
      return eventError(c, error, 'Failed to update event');
    }
  };

  const deleteEvent = async (c: Context) => {
    const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedId.success) return c.json({ error: 'Invalid event ID' }, 400);
    try {
      await eventService.deleteEvent(parsedId.data);
      return c.body(null, 204);
    } catch (error) {
      return eventError(c, error, 'Failed to delete event');
    }
  };

  return {
    getAllEvents,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

async function parseEventBody(c: Context) {
  const body = await c.req.json().catch(() => undefined);
  const parsed = eventWriteSchema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false as const,
      response: c.json(
        {
          error: 'Invalid event request body',
          details: parsed.error.flatten(),
        },
        400
      ),
    };
  }
  return {
    success: true as const,
    data: {
      ...parsed.data,
      rule_text: parsed.data.rule_text ?? null,
    } satisfies CreateEventRequestDTO,
  };
}

function eventError(c: Context, error: unknown, fallback: string) {
  if (error instanceof Error && error.message === 'Event not found') {
    return c.json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' }, 404);
  }
  if (error instanceof Error && error.message === 'Event is in use') {
    return c.json({ error: 'Event is in use' }, 409);
  }
  return c.json({ error: fallback }, 500);
}
