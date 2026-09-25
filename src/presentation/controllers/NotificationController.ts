import { Context } from 'hono';
import { z } from 'zod';
import { IFcmService } from '../../application/services/IFcmService';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';

const testNotificationSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export function createNotificationController(fcmService: IFcmService) {
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
    sendTestNotification,
  };
}
