import { Context } from 'hono';
import { z } from 'zod';
import { IFirebaseTokenService } from '../../application/services/IFirebaseTokenService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';
import { UserErrors } from '../errors/userErrors';

const registerFirebaseTokenSchema = z
  .object({
    fcmToken: z.string().min(1),
    platform: z.literal('android'),
  })
  .strict();

type FirebaseTokenContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

function isFirebaseTokenUniqueConstraintError(error: unknown): boolean {
  const visited = new Set<Error>();
  let current = error;

  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    if (
      current.message.includes('UNIQUE constraint failed') &&
      current.message.includes('firebase_tokens.fcm_token')
    ) {
      return true;
    }
    current = current.cause;
  }

  return false;
}

export function createFirebaseTokenController(
  firebaseTokenService: IFirebaseTokenService
) {
  const registerFirebaseToken = async (c: FirebaseTokenContext) => {
    try {
      const userId = c.get('authenticatedUserId');
      if (!userId) return errorResponse(c, CommonErrors.UNAUTHORIZED);

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return errorResponse(
          c,
          NotificationErrors.INVALID_FIREBASE_TOKEN_REQUEST
        );
      }

      const parsedBody = registerFirebaseTokenSchema.safeParse(body);
      if (!parsedBody.success) {
        return errorResponse(
          c,
          NotificationErrors.INVALID_FIREBASE_TOKEN_REQUEST,
          parsedBody.error.flatten()
        );
      }

      const result = await firebaseTokenService.registerFirebaseToken({
        userId,
        platform: parsedBody.data.platform,
        fcmToken: parsedBody.data.fcmToken,
      });

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        return errorResponse(c, UserErrors.USER_NOT_FOUND);
      }
      if (isFirebaseTokenUniqueConstraintError(error)) {
        return errorResponse(
          c,
          NotificationErrors.FIREBASE_TOKEN_REGISTRATION_CONFLICT
        );
      }
      return errorResponse(
        c,
        NotificationErrors.FIREBASE_TOKEN_REGISTRATION_FAILED
      );
    }
  };

  return { registerFirebaseToken };
}
