import { Context } from 'hono';
import { z } from 'zod';
import { IFcmService } from '../../application/services/IFcmService';
import type { INotificationService } from '../../application/services/INotificationService';

const testNotificationSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const createNotificationSchema = z.object({
  notificationType: z.string().trim().min(1),
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

const updateNotificationSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    body: z.string().trim().min(1).optional(),
  })
  .refine(input => input.title !== undefined || input.body !== undefined, {
    message: 'At least one of title or body is required',
  });

const notificationListQuerySchema = z.object({
  notificationType: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const notificationIdSchema = z.coerce.number().int().positive();

export function createNotificationController(
  fcmService: IFcmService,
  notificationService: INotificationService
) {
  const createNotification = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = createNotificationSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid notification request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const notification = await notificationService.createNotification({
        notification_type: parsedBody.data.notificationType,
        title: parsedBody.data.title,
        body: parsedBody.data.body,
      });
      return c.json(notification, 201);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to create notification',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const getNotifications = async (c: Context) => {
    const parsedQuery = notificationListQuerySchema.safeParse({
      notificationType: c.req.query('notificationType'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return c.json(
        {
          error: 'Invalid notification query',
          details: parsedQuery.error.flatten(),
        },
        400
      );
    }

    try {
      const result = await notificationService.getNotifications({
        notification_type: parsedQuery.data.notificationType,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      });
      return c.json({
        items: result.items,
        pagination: {
          limit: parsedQuery.data.limit,
          offset: parsedQuery.data.offset,
          total: result.total,
        },
      });
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch notifications',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const getNotificationById = async (c: Context) => {
    const parsedId = notificationIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success) {
      return c.json({ error: 'Invalid notification ID' }, 400);
    }

    try {
      return c.json(
        await notificationService.getNotificationById(parsedId.data)
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification not found'
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to fetch notification',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const updateNotification = async (c: Context) => {
    const parsedId = notificationIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success) {
      return c.json({ error: 'Invalid notification ID' }, 400);
    }
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = updateNotificationSchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid notification request body',
          details: parsedBody.error.flatten(),
        },
        400
      );
    }

    try {
      const notification = await notificationService.updateNotification(
        parsedId.data,
        parsedBody.data
      );
      return c.json(notification);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification not found'
      ) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to update notification',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

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

      const result = await fcmService.sendTestNotification(parsedBody.data);
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

  return {
    createNotification,
    getNotifications,
    getNotificationById,
    updateNotification,
    sendTestNotification,
  };
}
