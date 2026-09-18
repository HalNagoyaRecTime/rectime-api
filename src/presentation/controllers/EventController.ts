import { Context } from 'hono';
import { z } from 'zod';
import type { CreateEventRequestDTO } from '../../application/dto/EventDTO';
import type { IEventService } from '../../application/services/IEventService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import { CommonErrors } from '../errors/commonErrors';
import { EventErrors } from '../errors/eventErrors';
import {
  errorResponse,
  type ApiErrorDefinition,
} from '../errors/errorResponse';

const eventIdSchema = z.coerce.number().int().positive();
const hhmmSchema = z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/);
const eventBaseSchema = z.object({
  event_name: z.string().trim().min(1).max(100),
  rule_text: z.string().trim().max(1000).nullable().optional(),
  venue: z.string().trim().min(1).max(100),
  start_time: hhmmSchema,
  end_time: hhmmSchema,
});
const timeRangeRefinement: [
  (data: { start_time: string; end_time: string }) => boolean,
  { message: string; path: string[] },
] = [
  data => data.start_time < data.end_time,
  { message: 'end_time must be after start_time', path: ['end_time'] },
];

const eventWriteSchema = eventBaseSchema.refine(...timeRangeRefinement);

const eventUpdateSchema = eventBaseSchema
  .strict()
  .refine(...timeRangeRefinement);

type EventContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>;

export function createEventController(eventService: IEventService) {
  const getAllEvents = async (c: Context) => {
    try {
      const startTime = c.req.query('start_time');
      const limit = c.req.query('limit');
      const offset = c.req.query('offset');

      if (startTime !== undefined && !hhmmSchema.safeParse(startTime).success) {
        return errorResponse(c, EventErrors.INVALID_START_TIME);
      }

      return c.json(
        await eventService.getAllEvents({
          start_time: startTime,
          limit: limit ? parseInt(limit) : undefined,
          offset: offset ? parseInt(offset) : undefined,
        }),
        200
      );
    } catch {
      return errorResponse(c, EventErrors.EVENT_LIST_FAILED);
    }
  };

  const getEventById = async (c: Context) => {
    try {
      const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
      if (!parsedId.success) {
        return errorResponse(c, EventErrors.INVALID_EVENT_ID);
      }

      const event = await eventService.getEventById(parsedId.data);
      return c.json(event, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return errorResponse(c, EventErrors.EVENT_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.EVENT_FETCH_FAILED);
    }
  };

  const getMyEvents = async (c: Context) => {
    const eventContext = c as EventContext;
    const userId = eventContext.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
    }
    try {
      const events = await eventService.getMyEvents(userId);
      return c.json({ events });
    } catch {
      return errorResponse(c, EventErrors.MY_EVENT_LIST_FAILED);
    }
  };

  const createEvent = async (c: Context) => {
    const parsed = await parseEventBody(c, eventWriteSchema);
    if (!parsed.success) return parsed.response;
    try {
      return c.json(await eventService.createEvent(parsed.data), 201);
    } catch {
      return errorResponse(c, EventErrors.EVENT_CREATE_FAILED);
    }
  };

  const updateEvent = async (c: Context) => {
    const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedId.success)
      return errorResponse(c, EventErrors.INVALID_EVENT_ID);
    const parsed = await parseEventBody(c, eventUpdateSchema);
    if (!parsed.success) return parsed.response;
    try {
      return c.json(
        await eventService.updateEvent(parsedId.data, parsed.data),
        200
      );
    } catch (error) {
      return updateEventError(c, error);
    }
  };

  const deleteEvent = async (c: Context) => {
    const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedId.success)
      return errorResponse(c, EventErrors.INVALID_EVENT_ID);
    try {
      await eventService.deleteEvent(parsedId.data);
      return c.body(null, 204);
    } catch (error) {
      return eventError(c, error, EventErrors.EVENT_DELETE_FAILED);
    }
  };

  return {
    getAllEvents,
    getEventById,
    getMyEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

async function parseEventBody(
  c: Context,
  schema: typeof eventWriteSchema | typeof eventUpdateSchema
) {
  const body = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false as const,
      response: errorResponse(
        c,
        EventErrors.INVALID_EVENT_REQUEST,
        parsed.error.flatten()
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

function updateEventError(c: Context, error: unknown) {
  if (
    error instanceof Error &&
    error.message === 'end_time must be after start_time'
  ) {
    return errorResponse(c, EventErrors.INVALID_EVENT_TIME_RANGE);
  }
  if (error instanceof Error && error.message === 'Event not found') {
    return errorResponse(c, EventErrors.EVENT_NOT_FOUND);
  }
  return errorResponse(c, EventErrors.EVENT_UPDATE_FAILED);
}

function eventError(
  c: Context,
  error: unknown,
  fallback: ApiErrorDefinition<500>
) {
  if (
    error instanceof Error &&
    error.message === 'end_time must be after start_time'
  ) {
    return errorResponse(c, EventErrors.INVALID_EVENT_TIME_RANGE);
  }
  if (error instanceof Error && error.message === 'Event not found') {
    return errorResponse(c, EventErrors.EVENT_NOT_FOUND);
  }
  if (error instanceof Error && error.message === 'Event is in use') {
    return errorResponse(c, EventErrors.EVENT_IN_USE);
  }
  return errorResponse(c, fallback);
}
