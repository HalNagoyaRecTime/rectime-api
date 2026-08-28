import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  unauthorizedResponse,
  z,
} from './schemas';

export const userSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .optional()
    .openapi({
      param: { name: 'q', in: 'query' },
      description: 'ユーザー名・user_id・クラスコード・クラス名の検索文字列',
      example: '山田',
    }),
  category: z
    .enum(['all', 'student', 'teacher'])
    .default('all')
    .optional()
    .openapi({
      param: { name: 'category', in: 'query' },
      description: 'ユーザーカテゴリ',
      example: 'all',
    }),
  status: z
    .enum(['active', 'inactive', 'all'])
    .default('active')
    .optional()
    .openapi({
      param: { name: 'status', in: 'query' },
      description: 'ユーザーの有効状態',
      example: 'active',
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .optional()
    .openapi({
      param: { name: 'limit', in: 'query' },
      example: 50,
    }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .optional()
    .openapi({
      param: { name: 'offset', in: 'query' },
      example: 0,
    }),
});

export const userSearchItemSchema = z
  .object({
    user_id: z.number().int(),
    display_name: z.string(),
    is_live_active: z.boolean(),
    categories: z.array(z.enum(['student', 'teacher'])),
  })
  .openapi('UserSearchItem');

export const userSearchResponseSchema = z
  .object({
    items: z.array(userSearchItemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi('UserSearchResponse');

export type UserSearchResponseDTO = z.infer<typeof userSearchResponseSchema>;

export const userSearchRoute = createRoute({
  method: 'get',
  path: '/admin/users',
  tags: ['Users'],
  summary: '管理画面向けにユーザーを横断検索する',
  security: bearerAuth,
  request: { query: userSearchQuerySchema },
  responses: {
    200: jsonResponse(userSearchResponseSchema, 'ユーザー検索結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});
