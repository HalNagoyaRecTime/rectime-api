import { Context } from 'hono';
import { IFirebaseTokenService } from '../../application/services/IFirebaseTokenService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { NotificationErrors } from '../errors/notificationErrors';
import {
  firebaseTokenIdParams,
  firebaseTokenRegistrationRequestSchema,
} from '../openapi/notification/firebaseTokens';

type FirebaseTokenContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

const firebaseTokenDeletionFailed = {
  status: 500,
  code: 'FIREBASE_TOKEN_DELETION_FAILED',
  message: 'Firebaseトークンの削除に失敗しました',
} as const;

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
        return errorResponse(c, CommonErrors.VALIDATION_ERROR);
      }

      const parsedBody = firebaseTokenRegistrationRequestSchema.safeParse(body);
      if (!parsedBody.success) {
        return errorResponse(
          c,
          CommonErrors.VALIDATION_ERROR,
          parsedBody.error.flatten()
        );
      }

      const result = await firebaseTokenService.registerFirebaseToken({
        userId,
        platform: parsedBody.data.platform,
        fcmToken: parsedBody.data.fcmToken,
      });

      return c.json(result, 200);
    } catch {
      return errorResponse(
        c,
        NotificationErrors.FIREBASE_TOKEN_REGISTRATION_FAILED
      );
    }
  };

  const deleteFirebaseToken = async (c: FirebaseTokenContext) => {
    try {
      const userId = c.get('authenticatedUserId');
      if (!userId) return errorResponse(c, CommonErrors.UNAUTHORIZED);

      const parsedParams = firebaseTokenIdParams.safeParse({
        firebaseTokenId: c.req.param('firebaseTokenId'),
      });
      if (!parsedParams.success) {
        return errorResponse(
          c,
          CommonErrors.VALIDATION_ERROR,
          parsedParams.error.flatten()
        );
      }

      const result = await firebaseTokenService.deleteFirebaseToken(
        Number(parsedParams.data.firebaseTokenId),
        userId
      );
      if (result === 'deleted') return c.body(null, 204);
      if (result === 'forbidden') {
        return errorResponse(c, NotificationErrors.FIREBASE_TOKEN_FORBIDDEN);
      }
      return errorResponse(c, NotificationErrors.FIREBASE_TOKEN_NOT_FOUND);
    } catch {
      return errorResponse(c, firebaseTokenDeletionFailed);
    }
  };

  return { registerFirebaseToken, deleteFirebaseToken };
}
