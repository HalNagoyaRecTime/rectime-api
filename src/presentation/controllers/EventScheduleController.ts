import type { Context } from 'hono';
import { z } from 'zod';
import type { IEventScheduleService } from '../../application/services/IEventScheduleService';
import {
  getSession,
  getSessionIdFromCookie,
} from '../../infrastructure/auth/session';
import type { Env } from '../../lib/env';
import { isValidEventDate } from '../../lib/eventDate';
import type { ContainerVariables } from '../middleware/diContainer';

const eventIdSchema = z.coerce.number().int().positive();
const hhmmSchema = z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/);
const updateEventScheduleSchema = z
  .object({
    startTime: hhmmSchema,
    endTime: hhmmSchema,
    gatheringGroupId: z.number().int().positive(),
    notificationEnabled: z.boolean(),
  })
  .refine(input => input.startTime < input.endTime, {
    message: 'endTime must be later than startTime',
    path: ['endTime'],
  });

type EventScheduleContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables;
}>;

export function createEventScheduleController(
  eventScheduleService: IEventScheduleService
) {
  const updateEventSchedule = async (c: EventScheduleContext) => {
    const parsedEventId = eventIdSchema.safeParse(c.req.param('eventId'));
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = updateEventScheduleSchema.safeParse(body);
    if (!parsedEventId.success || !parsedBody.success) {
      return c.json(
        {
          error: 'Invalid event schedule request',
          details: parsedBody.success ? undefined : parsedBody.error.flatten(),
        },
        400
      );
    }

    const sessionId = getSessionIdFromCookie(c.req.header('Cookie') ?? null);
    const session = sessionId
      ? await getSession(c.env.AUTH_KV, sessionId)
      : null;
    const userId = Number(session?.user_id);
    if (!session || !Number.isInteger(userId) || userId <= 0) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    const eventDate = c.env.EVENT_DATE;
    if (!isValidEventDate(eventDate)) {
      return c.json({ error: 'EVENT_DATE is not configured correctly' }, 500);
    }

    try {
      return c.json(
        await eventScheduleService.updateEventSchedule({
          event_id: parsedEventId.data,
          user_id: userId,
          gathering_group_id: parsedBody.data.gatheringGroupId,
          start_time: parsedBody.data.startTime,
          end_time: parsedBody.data.endTime,
          notification_enabled: parsedBody.data.notificationEnabled,
          event_date: eventDate,
        })
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return c.json({ error: error.message }, 404);
      }
      if (
        error instanceof Error &&
        error.message === 'Schedule update forbidden'
      ) {
        return c.json({ error: error.message }, 403);
      }
      if (
        error instanceof Error &&
        error.message === 'Gathering group is not assigned to event'
      ) {
        return c.json({ error: error.message }, 400);
      }
      if (
        error instanceof Error &&
        (error.message === 'Draft notification schedule was changed' ||
          error.message === 'Failed to persist draft notification schedule')
      ) {
        return c.json({ error: error.message }, 409);
      }
      return c.json(
        {
          error: 'Failed to update event schedule',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return { updateEventSchedule };
}
