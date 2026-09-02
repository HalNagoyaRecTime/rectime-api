import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  paginationFields,
  unauthorizedResponse,
  z,
} from './schemas';

export const adminUserSearchQuery = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .optional()
    .openapi({
      param: { name: 'q', in: 'query' },
      description: '表示名、ユーザーID、クラスコード、クラス名の検索文字列',
    }),
  category: z
    .enum(['all', 'student', 'teacher'])
    .default('all')
    .optional()
    .openapi({ param: { name: 'category', in: 'query' }, example: 'all' }),
  status: z
    .enum(['active', 'inactive', 'all'])
    .default('active')
    .optional()
    .openapi({ param: { name: 'status', in: 'query' }, example: 'active' }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' }, example: 50 }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .optional()
    .openapi({ param: { name: 'offset', in: 'query' }, example: 0 }),
});

export const adminUserSearchItemSchema = z
  .object({
    user_id: z.number().int(),
    display_name: z.string(),
    is_live_active: z.boolean(),
    categories: z.array(z.enum(['student', 'teacher'])),
  })
  .openapi('AdminUserSearchItem');

export const adminUserSearchResponseSchema = z
  .object({
    items: z.array(adminUserSearchItemSchema),
    ...paginationFields,
  })
  .openapi('AdminUserSearchResponse');

export const adminUserSearchRoute = createRoute({
  method: 'get',
  path: '/admin/users',
  tags: ['Admin users'],
  summary: '管理画面向けにユーザーを横断検索する',
  security: bearerAuth,
  request: { query: adminUserSearchQuery },
  responses: {
    200: jsonResponse(adminUserSearchResponseSchema, 'ユーザー検索結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});
