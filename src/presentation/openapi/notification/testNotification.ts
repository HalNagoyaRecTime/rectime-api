import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  unauthorizedResponse,
  z,
} from '../schemas';

export const fcmNotificationResponseSchema = z
  .object({ success: z.literal(true), messageId: z.string() })
  .openapi('FcmNotificationResult');

export type FcmNotificationResponseDTO = z.infer<
  typeof fcmNotificationResponseSchema
>;

export const testNotificationSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
  })
  .openapi('TestNotificationRequest');

export const testNotificationRoute = createRoute({
  method: 'post',
  path: '/notifications/test',
  tags: ['Notifications'],
  summary: 'テスト通知を送信する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: testNotificationSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(fcmNotificationResponseSchema, '送信結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});
