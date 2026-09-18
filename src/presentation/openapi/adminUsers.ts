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
    '',
    '退会済み(`deletion_status` が `active` 以外)のUserは対象外で404を返す。',
    '有効化しても本人はログインできず、通知の宛先にだけ入る状態になるため。',
    '',
    '無効化するとリクエストごとの認証で遮断されるため、発行済みのトークンが',
    '手元に残っていても以降のAPIアクセスは拒否される。',
    '',
    '通知は無効化中のUserには届かない。管理画面から送る通知とイベント更新で',
    '作られる通知予定は宛先から外れ、無効化前に積まれていた予定は送信時に',
    '稼働状態を確認して送らずに `failed` にする。再有効化後に送信時刻を迎える',
    '予定はそのまま届く。Firebaseトークンと集合グループの所属は削除・無効化',
    'せず保持する。退会と異なり無効化は可逆であり、再有効化時に元へ戻せる',
    '状態を残すため。',
    '',
    'Teacherを無効化しても `class_rooms.teacher_id` は保持するが、',
    '教室の取得では担任として返さないため、表示上は担任なしになる。',
    '再有効化すると元の担任に戻る。',
    '割り当て自体を解除するには、有効な状態で `PUT /teachers/{teacherId}` へ',
    '`classRoomIds: []` を指定する。',
    '',
    '`GET /students` と `GET /teachers` はいずれも既定で稼働中のみを返すため、',
    '無効化すると一覧から消える。無効化済みも含めて取得するには',
    '`isLiveActive=all` を指定する。',
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
