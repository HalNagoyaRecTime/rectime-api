import { createRoute } from '@hono/zod-openapi';
import {
  bearerAuth,
  internalServerErrorResponse,
  isoDateTimeSchema,
  noContentResponse,
  positivePathParam,
  z,
} from '../schemas';
import {
  notificationNotFoundResponse,
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
    lastSeenAt: isoDateTimeSchema,
  })
  .strict()
  .openapi('FirebaseToken');

export const firebaseTokenIdParams = z.object({
  firebaseTokenId: positivePathParam('firebaseTokenId', 'FirebaseトークンID'),
});

export const firebaseTokenDeleteRoute = createRoute({
  method: 'delete',
  path: '/firebase-tokens/{firebaseTokenId}',
  tags: ['Firebase tokens'],
  summary: 'Firebaseトークンを削除する',
  security: bearerAuth,
  request: { params: firebaseTokenIdParams },
  responses: {
    204: noContentResponse,
    401: notificationUnauthorizedResponse,
    404: notificationNotFoundResponse,
    500: internalServerErrorResponse,
  },
});
