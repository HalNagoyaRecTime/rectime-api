import type { Context } from 'hono';
import { z } from 'zod';
import type { IEventScheduleService } from '../../application/services/IEventScheduleService';
import type { Env } from '../../lib/env';
import { isValidEventDate } from '../../lib/eventDate';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';

const eventIdSchema = z.coerce.number().int().positive();
const hhmmSchema = z.string().regex(/^([01]\d|2[0-3])[0-5]\d$/);
const updateEventScheduleSchema = z
  .object({
    startTime: hhmmSchema,
    endTime: hhmmSchema,
    notificationEnabled: z.boolean(),
  })
  .refine(input => input.startTime < input.endTime, {
    message: 'endTime must be later than startTime',
    path: ['endTime'],
  });

type EventScheduleContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
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

    const userId = c.get('authenticatedUserId');
    if (userId === null) {
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
          start_time: parsedBody.data.startTime,
          end_time: parsedBody.data.endTime,
          notification_enabled: parsedBody.data.notificationEnabled,
          event_date: eventDate,
        }),
        200
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return c.json({ error: error.message }, 404);
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

  const getEventNotificationSummary = async (c: EventScheduleContext) => {
    const parsedEventId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedEventId.success) {
      return c.json({ error: 'Invalid event ID' }, 400);
    }
    if (c.get('authenticatedUserId') === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    try {
      return c.json(
        await eventScheduleService.getEventNotificationSummary(
          parsedEventId.data
        ),
        200
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to fetch event notification summary',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return { updateEventSchedule, getEventNotificationSummary };
}
