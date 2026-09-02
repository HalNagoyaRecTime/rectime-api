import { Context } from 'hono';
import { z } from 'zod';
import { IFirebaseTokenService } from '../../application/services/IFirebaseTokenService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { AuthVariables } from '../middleware/requireAuth';

const registerFirebaseTokenSchema = z
  .object({
    fcmToken: z.string().min(1),
    platform: z.enum(['ios', 'android']),
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
      if (!userId) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid Firebase token request body' }, 400);
      }

      const parsedBody = registerFirebaseTokenSchema.safeParse(body);

      if (!parsedBody.success) {
        return c.json(
          {
            error: 'Invalid Firebase token request body',
            details: parsedBody.error.flatten(),
          },
          400
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
        return c.json({ error: error.message }, 404);
      }
      if (isFirebaseTokenUniqueConstraintError(error)) {
        return c.json(
          { error: 'Firebase token is being registered by another request' },
          409
        );
      }
      return c.json(
        {
          error: 'Failed to register Firebase token',
        },
        500
      );
    }
  };

  const unregisterFirebaseToken = async (c: FirebaseTokenContext) => {
    try {
      const userId = c.get('authenticatedUserId');
      if (!userId) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      await firebaseTokenService.unregisterFirebaseToken(userId);
      return c.body(null, 204);
    } catch {
      return c.json(
        {
          error: 'Failed to unregister Firebase token',
        },
        500
      );
    }
  };

  return {
    registerFirebaseToken,
    unregisterFirebaseToken,
  };
}
