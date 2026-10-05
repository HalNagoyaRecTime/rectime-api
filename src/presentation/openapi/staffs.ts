import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const staffResponseSchema = z
  .object({
    staff_id: z.number().int(),
    user_id: z.number().int(),
    display_name: z.string(),
  })
  .openapi('Staff');

export type StaffResponseDTO = z.infer<typeof staffResponseSchema>;

export const staffListResponseSchema = z
  .array(staffResponseSchema)
  .openapi('StaffList');

export type StaffListResponseDTO = z.infer<typeof staffListResponseSchema>;

export const staffIdParams = z.object({
  staffId: positivePathParam('staffId', '職員ID'),
});

export const staffListRoute = createRoute({
  method: 'get',
  path: '/staffs',
  tags: ['Staffs'],
  summary: '職員一覧を取得する',
  security: bearerAuth,
  responses: {
    200: jsonResponse(staffListResponseSchema, '職員一覧'),
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

// staff権限の付け外しは操作対象がUserなのでパスは/admin/users配下に置く。
// staffs.user_id にUNIQUE制約があるため、staff権限は「ある/ない」の2状態で
// 表現でき、PUT/DELETEをそのまま冪等な操作として扱える。
export const adminUserStaffParams = z.object({
  userId: positivePathParam('userId', 'ユーザーID'),
});

export const adminUserStaffAssignRoute = createRoute({
  method: 'put',
  path: '/admin/users/{userId}/staff',
  tags: ['Staffs'],
  summary: 'Userにstaff権限を付与する',
  description: [
    '`staffs` に対象Userの行を存在させる。',
    'すでにstaff権限を持つUserへ実行しても成功として扱うため、',
    '同じリクエストを何度実行しても最終状態は変わらない。',
    '',
    '退会済み(`deletion_status` が `active` 以外)のUserは対象外で404を返す。',
    '本人がログインできないUserにstaff権限を持たせても意味がないため。',
  ].join('\n'),
  security: bearerAuth,
  request: { params: adminUserStaffParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const adminUserStaffRevokeRoute = createRoute({
  method: 'delete',
  path: '/admin/users/{userId}/staff',
  tags: ['Staffs'],
  summary: 'Userのstaff権限を解除する',
  description: [
    '`staffs` から対象Userの行を削除する。User自体は削除せず、',
    'Student / Teacher情報や所属も変更しない。',
    'staff権限を持たないUserへ実行しても成功として扱う(冪等)。',
    '',
    '退会済み(`deletion_status` が `active` 以外)のUserは対象外で404を返す。',
    '',
    '次の2つは400で断る。いずれもstaff権限を戻す手段が失われるため。',
    '- 自分自身の解除。解除した瞬間に管理系の操作ができなくなる。',
    '- 有効なstaffが0人になる解除。有効とは無効化されておらず退会もしていないこと。',
  ].join('\n'),
  security: bearerAuth,
  request: { params: adminUserStaffParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const staffDetailRoute = createRoute({
  method: 'get',
  path: '/staffs/{staffId}',
  tags: ['Staffs'],
  summary: '職員を取得する',
  security: bearerAuth,
  request: { params: staffIdParams },
  responses: {
    200: jsonResponse(staffResponseSchema, '職員'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
