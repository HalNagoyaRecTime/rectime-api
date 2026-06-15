import { Context } from 'hono';
import { z } from 'zod';
import { NotificationControllerFunctions } from '../types/controllers';
import { FcmServiceFunctions } from '../types/services';

const testNotificationSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export function createNotificationController(
  fcmService: FcmServiceFunctions
): NotificationControllerFunctions {
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
    sendTestNotification,
  };
}
