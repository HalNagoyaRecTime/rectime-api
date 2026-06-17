import { Context } from 'hono';
import { z } from 'zod';
import { NotificationControllerFunctions } from '../types/controllers';
import {
  FcmServiceFunctions,
  NotificationServiceFunctions,
} from '../types/services';

const testNotificationSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

const notificationListQuerySchema = z.object({
  readStatus: z.enum(['all', 'read', 'unread']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export function createNotificationController(
  fcmService: FcmServiceFunctions,
  notificationService: NotificationServiceFunctions
): NotificationControllerFunctions {
  const getStudentNumber = (c: Context): string | null => {
    return (
      c.req.header('X-Student-Number') ??
      c.req.query('studentNumber') ??
      c.req.query('student_number') ??
      null
    );
  };

  const getNotifications = async (c: Context) => {
    try {
      const studentNumber = getStudentNumber(c);

      if (!studentNumber) {
        return c.json({ error: 'studentNumber is required' }, 400);
      }

      const parsedQuery = notificationListQuerySchema.safeParse({
        readStatus: c.req.query('read_status') ?? c.req.query('readStatus'),
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

      const result = await notificationService.getNotifications({
        studentNumber,
        readStatus: parsedQuery.data.readStatus,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      });

      return c.json({
        ...result,
        notifications: result.notifications.map(notification => ({
          ...notification,
          is_read: notification.read_at !== null,
        })),
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

  const getUnreadCount = async (c: Context) => {
    try {
      const studentNumber = getStudentNumber(c);

      if (!studentNumber) {
        return c.json({ error: 'studentNumber is required' }, 400);
      }

      const result = await notificationService.getUnreadCount(studentNumber);
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to fetch unread notification count',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const markNotificationAsRead = async (c: Context) => {
    try {
      const studentNumber = getStudentNumber(c);
      const notificationId = Number(c.req.param('id'));

      if (!studentNumber) {
        return c.json({ error: 'studentNumber is required' }, 400);
      }

      if (Number.isNaN(notificationId)) {
        return c.json({ error: 'Invalid notification ID' }, 400);
      }

      const result = await notificationService.markAsRead(
        studentNumber,
        notificationId
      );

      return c.json(result);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Notification not found'
      ) {
        return c.json({ error: 'Notification not found' }, 404);
      }

      return c.json(
        {
          error: 'Failed to mark notification as read',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  const markAllNotificationsAsRead = async (c: Context) => {
    try {
      const studentNumber = getStudentNumber(c);

      if (!studentNumber) {
        return c.json({ error: 'studentNumber is required' }, 400);
      }

      const result = await notificationService.markAllAsRead(studentNumber);
      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to mark notifications as read',
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
    getNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    sendTestNotification,
  };
}
