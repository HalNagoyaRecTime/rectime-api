import { Context } from 'hono';
import { z } from 'zod';
import type {
  CreateEventRequestDTO,
  PatchEventRequestDTO,
  UpdateEventRequestDTO,
} from '../../application/dto/EventDTO';
import type { IEventScheduleService } from '../../application/services/IEventScheduleService';
import type { IEventService } from '../../application/services/IEventService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';

const eventIdSchema = z.coerce.number().int().positive();
const hhmmSchema = z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/);
const eventListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
const eventWriteSchema = z
  .object({
    event_name: z.string().trim().min(1).max(100),
    rule_text: z.string().trim().max(1000).nullable().optional(),
    venue: z.string().trim().min(1).max(100),
    start_time: hhmmSchema,
    end_time: hhmmSchema,
  })
  .refine(data => data.start_time < data.end_time, {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  });

const eventUpdateSchema = eventWriteSchema.and(
  z.object({ notification_enabled: z.boolean().optional() })
);
const eventPatchSchema = z
  .object({
    event_name: z.string().trim().min(1).max(100).optional(),
    rule_text: z.string().trim().max(1000).nullable().optional(),
    venue: z.string().trim().min(1).max(100).optional(),
    start_time: hhmmSchema.optional(),
    end_time: hhmmSchema.optional(),
    notification_enabled: z.boolean().optional(),
  })
  .refine(data => Object.values(data).some(value => value !== undefined), {
    message: 'At least one field is required',
  })
  .refine(
    data =>
      data.start_time === undefined ||
      data.end_time === undefined ||
      data.start_time < data.end_time,
    {
      message: 'end_time must be after start_time',
      path: ['end_time'],
    }
  );

type EventContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>;

export function createEventController(
  eventService: IEventService,
  eventScheduleService: IEventScheduleService
) {
  const getAllEvents = async (c: Context) => {
    try {
      const startTime = c.req.query('start_time');

      if (startTime !== undefined && !hhmmSchema.safeParse(startTime).success) {
        return c.json(
          { error: 'Invalid start_time', code: 'INVALID_START_TIME' },
          400
        );
      }

      const parsedQuery = eventListQuerySchema.safeParse({
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
      });
      if (!parsedQuery.success) {
        return c.json(
          {
            error: 'Invalid event list query',
            details: parsedQuery.error.flatten(),
          },
          400
        );
      }

      return c.json(
        await eventService.getAllEvents({
          start_time: startTime,
          limit: parsedQuery.data.limit,
          offset: parsedQuery.data.offset,
        }),
        200
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

  const getMyEvents = async (c: Context) => {
    const eventContext = c as EventContext;
    const userId = eventContext.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    try {
      const events = await eventService.getMyEvents(userId);
      return c.json({ events });
    } catch (error) {
      const details =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : error instanceof Error
            ? error.message
            : String(error);
      return c.json({ error: 'Failed to fetch events', details }, 500);
    }
  };

  const createEvent = async (c: Context) => {
    const parsed = await parseEventBody(c);
    if (!parsed.success) return parsed.response;
    try {
      return c.json(await eventService.createEvent(parsed.data), 201);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to create event',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const updateEvent = async (c: Context) => {
    const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedId.success) return c.json({ error: 'Invalid event ID' }, 400);
    const body = await c.req.json().catch(() => undefined);
    const parsed = eventUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'Invalid event request body',
          details: parsed.error.flatten(),
        },
        400
      );
    }
    const request = {
      ...parsed.data,
      rule_text: parsed.data.rule_text ?? null,
    } satisfies UpdateEventRequestDTO;
    const eventContext = c as EventContext;
    const userId = eventContext.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    try {
      return c.json(
        await eventScheduleService.updateEventSchedule({
          event_id: parsedId.data,
          user_id: userId,
          event_name: request.event_name,
          rule_text: request.rule_text,
          venue: request.venue,
          start_time: request.start_time,
          end_time: request.end_time,
          notification_enabled: request.notification_enabled,
          event_date: eventContext.env?.EVENT_DATE,
        }),
        200
      );
    } catch (error) {
      return eventError(c, error, 'Failed to update event');
    }
  };

  const patchEvent = async (c: Context) => {
    const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedId.success) return c.json({ error: 'Invalid event ID' }, 400);
    const body = await c.req.json().catch(() => undefined);
    const parsed = eventPatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'Invalid event request body',
          details: parsed.error.flatten(),
        },
        400
      );
    }
    const request = parsed.data satisfies PatchEventRequestDTO;
    const eventContext = c as EventContext;
    const userId = eventContext.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    try {
      return c.json(
        await eventScheduleService.updateEventSchedule({
          event_id: parsedId.data,
          user_id: userId,
          ...request,
          event_date: eventContext.env?.EVENT_DATE,
        }),
        200
      );
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
    getMyEvents,
    createEvent,
    updateEvent,
    patchEvent,
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
  if (
    error instanceof Error &&
    error.message === 'end_time must be after start_time'
  ) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof Error && error.message === 'Event not found') {
    return c.json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' }, 404);
  }
  if (error instanceof Error && error.message === 'Event is in use') {
    return c.json({ error: 'Event is in use' }, 409);
  }
  if (error instanceof Error && error.message === 'Schedule update forbidden') {
    return c.json({ error: error.message }, 403);
  }
  if (error instanceof Error && error.message === 'Event update conflict') {
    return c.json({ error: error.message, code: 'EVENT_UPDATE_CONFLICT' }, 409);
  }
  if (
    error instanceof Error &&
    error.message === 'EVENT_DATE is not configured correctly'
  ) {
    return c.json({ error: error.message }, 500);
  }
  return c.json(
    {
      error: fallback,
      details: error instanceof Error ? error.message : String(error),
    },
    500
  );
}
