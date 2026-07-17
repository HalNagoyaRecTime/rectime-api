import { z } from '@hono/zod-openapi';
import type { ZodSchema } from 'zod';

export { z };

type JsonResponse<Schema extends ZodSchema> = {
  readonly content: {
    readonly 'application/json': {
      readonly schema: Schema;
    };
  };
  readonly description: string;
};

export const jsonResponse = <Schema extends ZodSchema>(
  schema: Schema,
  description: string
): JsonResponse<Schema> =>
  ({
    content: { 'application/json': { schema } },
    description,
  }) as const;

export const errorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    details: z
      .union([
        z.string(),
        z.object({
          formErrors: z.array(z.string()),
          fieldErrors: z.record(z.array(z.string()).optional()),
        }),
      ])
      .optional(),
  })
  .openapi('Error');

export type ErrorResponseDTO = z.infer<typeof errorResponseSchema>;

export const badRequestResponse = jsonResponse(
  errorResponseSchema,
  '入力が不正'
);
export const notFoundResponse = jsonResponse(
  errorResponseSchema,
  '対象が存在しない'
);
export const conflictResponse = jsonResponse(
  errorResponseSchema,
  '競合している'
);
export const internalServerErrorResponse = jsonResponse(
  errorResponseSchema,
  'サーバー内部エラー'
);

export const timestampSchema = z
  .string()
  .openapi({ example: '2026-07-16 09:00:00' });

export const positivePathParam = (name: string, description: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .openapi({ param: { name, in: 'path' }, description, example: '1' });
