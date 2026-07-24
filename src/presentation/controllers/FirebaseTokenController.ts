import { Context } from 'hono';
import { z } from 'zod';
import { IFirebaseTokenService } from '../../application/services/IFirebaseTokenService';
import type { Env } from '../../lib/env';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthenticationVariables } from '../middleware/sessionAuthentication';

const registerFirebaseTokenSchema = z
  .object({
    fcmToken: z.string().min(1),
    platform: z.literal('android'),
  })
  .strict();

type FirebaseTokenContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>;

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

      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'User not found') {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: 'Failed to register Firebase token',
        },
        500
      );
    }
  };

  return {
    registerFirebaseToken,
  };
}
