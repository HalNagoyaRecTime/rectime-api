import { Context } from 'hono';
import { z } from 'zod';
import { IFcmService } from '../../application/services/IFcmService';
import type { INotificationService } from '../../application/services/INotificationService';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';

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
      return errorResponse(
        c,
        NotificationErrors.INVALID_NOTIFICATION_REQUEST,
        parsedBody.error.flatten()
      );
    }
    try {
      const notification = await notificationService.createNotification({
        notification_type: parsedBody.data.notificationType,
        title: parsedBody.data.title,
        body: parsedBody.data.body,
      });
      return c.json(notification, 201);
    } catch {
      return errorResponse(c, NotificationErrors.NOTIFICATION_CREATE_FAILED);
    }
  };

  const getNotifications = async (c: Context) => {
    const parsedQuery = notificationListQuerySchema.safeParse({
      notificationType: c.req.query('notificationType'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        NotificationErrors.INVALID_NOTIFICATION_QUERY,
        parsedQuery.error.flatten()
      );
    }
    try {
      const result = await notificationService.getNotifications({
        notification_type: parsedQuery.data.notificationType,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      });
      return c.json(
        {
          notifications: result.notifications,
          total: result.total,
          limit: parsedQuery.data.limit,
          offset: parsedQuery.data.offset,
        },
        200
      );
    } catch {
      return errorResponse(c, NotificationErrors.NOTIFICATION_LIST_FAILED);
    }
  };

  const getNotificationById = async (c: Context) => {
    const parsedId = notificationIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success)
      return errorResponse(c, NotificationErrors.INVALID_NOTIFICATION_ID);
    try {
      return c.json(
        await notificationService.getNotificationById(parsedId.data),
        200
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification not found'
      ) {
        return errorResponse(c, NotificationErrors.NOTIFICATION_NOT_FOUND);
      }
      return errorResponse(c, NotificationErrors.NOTIFICATION_FETCH_FAILED);
    }
  };

  const updateNotification = async (c: Context) => {
    const parsedId = notificationIdSchema.safeParse(c.req.param('id'));
    if (!parsedId.success)
      return errorResponse(c, NotificationErrors.INVALID_NOTIFICATION_ID);
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = updateNotificationSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        NotificationErrors.INVALID_NOTIFICATION_REQUEST,
        parsedBody.error.flatten()
      );
    }
    try {
      const notification = await notificationService.updateNotification(
        parsedId.data,
        parsedBody.data
      );
      return c.json(notification, 200);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification not found'
      ) {
        return errorResponse(c, NotificationErrors.NOTIFICATION_NOT_FOUND);
      }
      return errorResponse(c, NotificationErrors.NOTIFICATION_UPDATE_FAILED);
    }
  };

  const sendTestNotification = async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => undefined);
      const parsedBody = testNotificationSchema.safeParse(body);
      if (!parsedBody.success) {
        return errorResponse(
          c,
          NotificationErrors.INVALID_NOTIFICATION_REQUEST,
          parsedBody.error.flatten()
        );
      }
      const result = await fcmService.sendTestNotification(parsedBody.data);
      return c.json(result, 200);
    } catch {
      return errorResponse(c, NotificationErrors.TEST_NOTIFICATION_SEND_FAILED);
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
