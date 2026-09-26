import type { Context } from 'hono';
import type { CreateEventRequestDTO } from '../../application/dto/EventDTO';
import type { IEventService } from '../../application/services/IEventService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import {
  eventIdParams,
  eventListQuery,
  eventUpdateSchema,
  eventWriteSchema,
} from '../openapi/events';
import { positivePathParamToNumber } from '../openapi/schemas';
import { CommonErrors } from '../errors/commonErrors';
import { EventErrors } from '../errors/eventErrors';
import {
  errorResponse,
  type ApiErrorDefinition,
} from '../errors/errorResponse';

type EventContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>;

export function createEventController(eventService: IEventService) {
  const getAllEvents = async (c: Context) => {
    const query = {
      start_time: c.req.query('start_time'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    };
    const parsedQuery = eventListQuery.safeParse(query);
    if (!parsedQuery.success) {
      if (
        parsedQuery.error.issues.some(issue => issue.path[0] === 'start_time')
      ) {
        return errorResponse(c, EventErrors.INVALID_START_TIME);
      }
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        parsedQuery.error.flatten()
      );
    }

    try {
      return c.json(
        await eventService.getAllEvents({
          start_time: parsedQuery.data.start_time,
          limit: query.limit ? parseInt(query.limit) : undefined,
          offset: query.offset ? parseInt(query.offset) : undefined,
        }),
        200
      );
    } catch {
      return errorResponse(c, EventErrors.EVENT_LIST_FAILED);
    }
  };
  const getEventById = async (c: Context) => {
    try {
      const parsedParams = eventIdParams.safeParse({
        eventId: c.req.param('eventId'),
      });
      const eventId = parsedParams.success
        ? positivePathParamToNumber(parsedParams.data.eventId)
        : undefined;
      if (eventId === undefined) {
        return errorResponse(c, EventErrors.INVALID_EVENT_ID);
      }

      const event = await eventService.getEventById(eventId);
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
    } catch (error) {
      if (error instanceof Error && error.message === 'Venue not found') {
        return errorResponse(c, EventErrors.VENUE_NOT_FOUND);
      }
      return errorResponse(c, EventErrors.EVENT_CREATE_FAILED);
    }
  };

  const updateEvent = async (c: Context) => {
    const parsedParams = eventIdParams.safeParse({
      eventId: c.req.param('eventId'),
    });
    const eventId = parsedParams.success
      ? positivePathParamToNumber(parsedParams.data.eventId)
      : undefined;
    if (eventId === undefined) {
      return errorResponse(c, EventErrors.INVALID_EVENT_ID);
    }
    const parsed = await parseEventBody(c, eventUpdateSchema);
    if (!parsed.success) return parsed.response;
    try {
      return c.json(await eventService.updateEvent(eventId, parsed.data), 200);
    } catch (error) {
      return updateEventError(c, error);
    }
  };

  const deleteEvent = async (c: Context) => {
    const parsedParams = eventIdParams.safeParse({
      eventId: c.req.param('eventId'),
    });
    const eventId = parsedParams.success
      ? positivePathParamToNumber(parsedParams.data.eventId)
      : undefined;
    if (eventId === undefined) {
      return errorResponse(c, EventErrors.INVALID_EVENT_ID);
    }
    try {
      await eventService.deleteEvent(eventId);
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
  if (error instanceof Error && error.message === 'Venue not found') {
    return errorResponse(c, EventErrors.VENUE_NOT_FOUND);
  }
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
