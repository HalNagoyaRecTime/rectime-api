import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { ZodError, ZodSchema } from 'zod';

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
    error_code: z.string().optional(),
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

type ValidationHookResult =
  | { success: true }
  | { success: false; error: ZodError };

/**
 * OpenAPI側のZodスキーマがリクエストを弾いたときの400応答。
 *
 * OpenAPIHonoに渡さないと @hono/zod-openapi の組み込みフックが発火し、
 * 各ルートが400として文書化している errorResponseSchema とは異なる
 * `{ success: false, error: <ZodError> }` を返してしまう。
 */
export const validationDefaultHook = (
  result: ValidationHookResult,
  c: Context
): Response | undefined => {
  if (result.success) return;
  const body: ErrorResponseDTO = {
    error: 'Invalid request',
    code: 'VALIDATION_ERROR',
    details: result.error.flatten(),
  };
  return c.json(body, 400);
};

export const badRequestResponse = jsonResponse(
  errorResponseSchema,
  '入力が不正'
);
export const unauthorizedResponse = jsonResponse(
  errorResponseSchema,
  '認証が必要'
);
export const forbiddenResponse = jsonResponse(
  errorResponseSchema,
  '操作が許可されていない'
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

/** 応答本文を持たない成功応答。 */
export const noContentResponse = { description: '成功（応答本文なし）' };

/**
 * apiV1配下のルートはすべて bearerAuthenticationMiddleware と requireAuth を
 * 通るため、アクセストークンの提示が必須になる。
 */
export const bearerAuth: Record<string, string[]>[] = [{ Bearer: [] }];

export const timestampSchema = z
  .string()
  .openapi({ example: '2026-07-16 09:00:00' });

/** ISO 8601形式（UTCオフセットを含む）。 */
export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .openapi({ example: '2026-07-16T09:00:00.000Z' });

/** JSTのHHMM形式。 */
export const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3])[0-5]\d$/)
  .openapi({ example: '0930' });

export const sendStatusSchema = z
  .enum(['draft', 'sending', 'sent', 'failed'])
  .openapi('NotificationSendStatus');

export const positivePathParam = (name: string, description: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .openapi({ param: { name, in: 'path' }, description, example: '1' });

/** 件数指定のクエリ。上限と既定値はエンドポイントごとに異なる。 */
export const paginationQuery = (limitMax: number, limitDefault: number) =>
  z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(limitMax)
      .default(limitDefault)
      .optional()
      .openapi({
        param: { name: 'limit', in: 'query' },
        example: limitDefault,
      }),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .optional()
      .openapi({ param: { name: 'offset', in: 'query' }, example: 0 }),
  });

/** 一覧応答に共通で付与されるページング情報。 */
export const paginationFields = {
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
};
