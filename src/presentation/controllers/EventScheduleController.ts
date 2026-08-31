import type { Context } from 'hono';
import { z } from 'zod';
import type { IEventScheduleService } from '../../application/services/IEventScheduleService';
import type { Env } from '../../lib/env';
import { isValidEventDate } from '../../lib/eventDate';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { EventErrors } from '../errors/eventErrors';
import { errorResponse } from '../errors/errorResponse';

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
      return errorResponse(
        c,
        EventErrors.INVALID_EVENT_SCHEDULE_REQUEST,
        parsedBody.success ? undefined : parsedBody.error.flatten()
      );
    }

    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
    }
    const eventDate = c.env.EVENT_DATE;
    if (!isValidEventDate(eventDate)) {
      return errorResponse(c, CommonErrors.EVENT_DATE_INVALID);
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
        return errorResponse(c, EventErrors.EVENT_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Schedule update forbidden'
      ) {
        return errorResponse(c, CommonErrors.STAFF_REQUIRED);
      }
      return errorResponse(c, EventErrors.EVENT_SCHEDULE_UPDATE_FAILED);
    }
  };

  const getEventNotificationSummary = async (c: EventScheduleContext) => {
    const parsedEventId = eventIdSchema.safeParse(c.req.param('eventId'));
    if (!parsedEventId.success) {
      return errorResponse(c, EventErrors.INVALID_EVENT_ID);
    }
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
    }

    try {
      return c.json(
        await eventScheduleService.getEventNotificationSummary(
          parsedEventId.data,
          userId
        ),
        200
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Event not found') {
        return errorResponse(c, EventErrors.EVENT_NOT_FOUND);
      }
      if (
        error instanceof Error &&
        error.message === 'Schedule update forbidden'
      ) {
        return errorResponse(c, CommonErrors.STAFF_REQUIRED);
      }
      return errorResponse(c, EventErrors.EVENT_NOTIFICATION_SUMMARY_FAILED);
    }
  };

  return { updateEventSchedule, getEventNotificationSummary };
}
