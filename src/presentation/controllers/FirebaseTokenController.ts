import { Context } from 'hono';
import { z } from 'zod';
import { IFirebaseTokenService } from '../../application/services/IFirebaseTokenService';

const registerFirebaseTokenSchema = z
  .object({
    studentNumber: z.string().min(1),
    platform: z.enum(['android', 'ios']),
    fcmToken: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
    authProvider: z.string().min(1).optional(),
    providerUserId: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .refine(value => value.fcmToken || value.token, {
    message: 'fcmToken or token is required',
    path: ['fcmToken'],
  });

export function createFirebaseTokenController(
  firebaseTokenService: IFirebaseTokenService
) {
  const registerFirebaseToken = async (c: Context) => {
    try {
      const body = await c.req.json();
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
        studentNumber: parsedBody.data.studentNumber,
        platform: parsedBody.data.platform,
        fcmToken: parsedBody.data.fcmToken ?? parsedBody.data.token ?? '',
        authProvider: parsedBody.data.authProvider,
        providerUserId: parsedBody.data.providerUserId,
        email: parsedBody.data.email,
      });

      return c.json(result);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to register Firebase token',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return {
    registerFirebaseToken,
  };
}
