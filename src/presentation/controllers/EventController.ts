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
import { CommonErrors } from '../errors/commonErrors';
import { EventErrors } from '../errors/eventErrors';
import {
  errorResponse,
  type ApiErrorDefinition,
} from '../errors/errorResponse';

const eventIdSchema = z.coerce.number().int().positive();
const hhmmSchema = z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/);
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
    const parsed = await parseEventBody(c);
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
    const body = await c.req.json().catch(() => undefined);
    const parsed = eventUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_EVENT_REQUEST,
        parsed.error.flatten()
      );
    }
    const request = {
      ...parsed.data,
      rule_text: parsed.data.rule_text ?? null,
    } satisfies UpdateEventRequestDTO;
    const eventContext = c as EventContext;
    const userId = eventContext.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
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
      return eventError(c, error, EventErrors.EVENT_UPDATE_FAILED);
    }
  };

  const patchEvent = async (c: Context) => {
    const parsedId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedId.success)
      return errorResponse(c, EventErrors.INVALID_EVENT_ID);
    const body = await c.req.json().catch(() => undefined);
    const parsed = eventPatchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        c,
        EventErrors.INVALID_EVENT_REQUEST,
        parsed.error.flatten()
      );
    }
    const request = parsed.data satisfies PatchEventRequestDTO;
    const eventContext = c as EventContext;
    const userId = eventContext.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
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
      return eventError(c, error, EventErrors.EVENT_UPDATE_FAILED);
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
  if (error instanceof Error && error.message === 'Schedule update forbidden') {
    return errorResponse(c, CommonErrors.STAFF_REQUIRED);
  }
  if (error instanceof Error && error.message === 'Event update conflict') {
    return errorResponse(c, EventErrors.EVENT_UPDATE_CONFLICT);
  }
  if (
    error instanceof Error &&
    error.message === 'EVENT_DATE is not configured correctly'
  ) {
    return errorResponse(c, CommonErrors.EVENT_DATE_INVALID);
  }
  return errorResponse(c, fallback);
}
