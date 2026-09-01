import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
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
