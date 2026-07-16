import { Context } from 'hono';
import { IFcmService } from '../../application/services/IFcmService';
import { testNotificationSchema } from '../openapi';

export function createNotificationController(fcmService: IFcmService) {
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
      return c.json(result, 200);
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
