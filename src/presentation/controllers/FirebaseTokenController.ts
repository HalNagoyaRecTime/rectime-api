import { Context } from 'hono';
import { z } from 'zod';
import { IFirebaseTokenService } from '../../application/services/IFirebaseTokenService';

const registerFirebaseTokenSchema = z
  .object({
    studentNumber: z.string().min(1),
    platform: z.union([z.literal(1), z.literal(2)]),
    fcmToken: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
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
      });

      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Student not found') {
        return c.json({ error: error.message }, 404);
      }
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
