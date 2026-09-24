import { createRoute } from '@hono/zod-openapi';
import {
  bearerAuth,
  conflictResponse,
  internalServerErrorResponse,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  positivePathParam,
  utcDateTimeSchema,
  z,
} from '../schemas';
import {
  firebaseTokenForbiddenResponse,
  firebaseTokenNotFoundResponse,
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

export const firebaseTokenIdParams = z.object({
  firebaseTokenId: positivePathParam('firebaseTokenId', 'FirebaseトークンID'),
});

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
    409: conflictResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
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
    400: notificationBadRequestResponse,
    401: notificationUnauthorizedResponse,
    403: firebaseTokenForbiddenResponse,
    404: firebaseTokenNotFoundResponse,
    500: internalServerErrorResponse,
  },
});
