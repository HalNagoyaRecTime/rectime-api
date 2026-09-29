import { createRoute } from '@hono/zod-openapi';
import {
  bearerAuth,
  internalServerErrorResponse,
  jsonResponse,
  utcDateTimeSchema,
  z,
} from '../schemas';
import {
  notificationBadRequestResponse,
  notificationUnauthorizedResponse,
} from './errors';

export const firebaseTokenRegistrationRequestSchema = z
  .object({
    fcmToken: z.string().min(1),
    platform: z.enum(['ios', 'android']),
  })
  .strict()
  .openapi('FirebaseTokenRegistrationRequest');

export const firebaseTokenSchema = z
  .object({
    firebaseTokenId: z.number().int().positive(),
    userId: z.number().int().positive(),
    platform: z.enum(['ios', 'android']),
    lastSeenAt: utcDateTimeSchema,
  })
  .strict()
  .openapi('FirebaseToken');

export const firebaseTokenRegistrationRoute = createRoute({
  method: 'post',
  path: '/firebase-tokens',
  tags: ['Firebase tokens'],
  summary: 'Firebaseトークンを登録する',
  security: bearerAuth,
  request: {
    body: {
      content: {
        'application/json': { schema: firebaseTokenRegistrationRequestSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(firebaseTokenSchema, '登録結果'),
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    500: internalServerErrorResponse,
  },
});
