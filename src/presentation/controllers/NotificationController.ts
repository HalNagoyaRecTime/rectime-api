import { Context } from 'hono';
import { z } from 'zod';
import { IManualNotificationService } from '../../application/services/IManualNotificationService';
import { INotificationService } from '../../application/services/INotificationService';
import { IScheduledNotificationService } from '../../application/services/IScheduledNotificationService';

const testNotificationSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const manualNotificationSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    targetType: z.enum(['all', 'group']),
    targetIds: z.array(z.string()).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.targetType === 'group' && value.targetIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targetIds is required when targetType is group',
        path: ['targetIds'],
      });
    }
  });

export function createNotificationController(
  notificationService: INotificationService,
  manualNotificationService: IManualNotificationService,
  scheduledNotificationService: IScheduledNotificationService
) {
  const sendTestNotification = async (c: Context) => {
    try {
      const body = await c.req.json();
      const parsedBody = testNotificationSchema.safeParse(body);

      if (!parsedBody.success) {
        return c.json(
          {
            error: 'Invalid notification request body',
            details: parsedBody.error.flatten(),
          },
          400
        );
      }

      const result = await notificationService.sendTestNotification(
        parsedBody.data
      );
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to send test notification',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const sendManualNotification = async (c: Context) => {
    try {
      const body = await c.req.json();
      const parsedBody = manualNotificationSchema.safeParse(body);

      if (!parsedBody.success) {
        return c.json(
          {
            error: 'Invalid manual notification request body',
            details: parsedBody.error.flatten(),
          },
          400
        );
      }

      const result = await manualNotificationService.sendManualNotification({
        ...parsedBody.data,
        targetIds:
          parsedBody.data.targetType === 'all' ? [] : parsedBody.data.targetIds,
      });

      return c.json(result, 201);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to send manual notification',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const runScheduledNotifications = async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const now =
        body && typeof body.now === 'string' ? new Date(body.now) : new Date();

      if (Number.isNaN(now.getTime())) {
        return c.json({ error: 'Invalid now value' }, 400);
      }

      const result =
        await scheduledNotificationService.sendScheduledEventNotifications(now);
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to run scheduled notifications',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return {
    sendTestNotification,
    sendManualNotification,
    runScheduledNotifications,
  };
}
