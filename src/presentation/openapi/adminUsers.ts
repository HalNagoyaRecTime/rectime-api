import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  paginationFields,
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const userStatusResponseSchema = z
  .object({
    user_id: z.number().int(),
    is_live_active: z.boolean(),
  })
  .openapi('UserStatus');

export type UserStatusResponseDTO = z.infer<typeof userStatusResponseSchema>;

export const adminUserIdParams = z.object({
  userId: positivePathParam('userId', 'ユーザーID'),
});

export const userStatusUpdateSchema = z
  .object({
    is_live_active: z.boolean().openapi({
      description: 'trueでUserを有効化、falseで無効化する。',
    }),
  })
  .strict()
  .openapi('UserStatusUpdateRequest');

export const adminUserStatusUpdateRoute = createRoute({
  method: 'patch',
  path: '/admin/users/{userId}',
  tags: ['Users'],
  summary: 'Userの有効・無効状態を変更する',
  description: [
    '`users.is_live_active` のみを更新する。',
    '通常運用ではUserを物理削除せず、この状態で利用可能かどうかを管理する。',
    'Student / Teacher固有データや所属情報は変更しないため、',
    '再有効化すると無効化前の情報をそのまま利用できる。',
    '',
    '自分自身の無効化と、有効な管理権限保持者が0人になる無効化は400で断る。',
    'いずれも再有効化する手段が失われるため。',
    '',
    '注意: 無効化しても発行済みのトークンは失効しない。',
    '認証・認可が `users.is_live_active` を参照していないため（Issue #255）、',
    '無効化したUserも手元のアクセストークン（既定1時間）が切れるまでは',
    '各エンドポイントを利用できる。モバイルは更新用トークン（既定90日）で',
    'アクセストークンを再発行でき、再発行のたびに有効期限が延びる。',
    '無効化で確実に止まるのは、通知配信の宛先抽出のように',
    '`is_live_active` を条件に含む処理だけである。',
    'Issue #255の対応が入るまで、この無効化は即時のアクセス遮断を意味しない。',
  ].join('\n'),
  security: bearerAuth,
  request: {
    params: adminUserIdParams,
    body: {
      content: { 'application/json': { schema: userStatusUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(userStatusResponseSchema, '変更後のUser状態'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

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
