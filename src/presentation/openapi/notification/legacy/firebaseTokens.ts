import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  timestampSchema,
  unauthorizedResponse,
  z,
} from '../../schemas';

export const firebaseTokenRegistrationResponseSchema = z
  .object({
    firebase_token_id: z.number().int(),
    user_id: z.number().int(),
    platform: z.enum(['ios', 'android']),
    is_firebase_active: z.boolean(),
    last_seen_at: timestampSchema,
  })
  .openapi('RegisterFirebaseTokenResponse');

export type FirebaseTokenRegistrationResponseDTO = z.infer<
  typeof firebaseTokenRegistrationResponseSchema
>;

export const registerFirebaseTokenSchema = z
  .object({
    fcmToken: z.string().min(1),
    platform: z.enum(['ios', 'android']),
  })
  .openapi('RegisterFirebaseTokenRequest');

export const firebaseTokenCreateRoute = createRoute({
  method: 'post',
  path: '/firebase-tokens',
  tags: ['Firebase tokens'],
  summary: 'Firebaseトークンを登録する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: registerFirebaseTokenSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(firebaseTokenRegistrationResponseSchema, '登録結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});
