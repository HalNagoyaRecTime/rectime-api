import { createRoute } from '@hono/zod-openapi';
import type { UpdateGatheringSpotRequestDTO } from '../../application/dto/UpdateGatheringSpotRequestDTO';
import type { GatheringSpotListOptions } from '../../domain/entities/GatheringSpot';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  paginationFields,
  positivePathParam,
  timestampSchema,
  unauthorizedResponse,
  z,
} from './schemas';

export const gatheringSpotResponseSchema = z
  .object({
    gathering_spot_id: z.number().int(),
    gathering_spot_name: z.string(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('GatheringSpot');

export type GatheringSpotResponseDTO = z.infer<
  typeof gatheringSpotResponseSchema
>;

export const gatheringSpotListResponseSchema = z
  .array(gatheringSpotResponseSchema)
  .openapi('GatheringSpotList');

export type GatheringSpotListResponseDTO = z.infer<
  typeof gatheringSpotListResponseSchema
>;

export const gatheringSpotPageResponseSchema = z
  .object({
    gathering_spots: z.array(gatheringSpotResponseSchema),
    ...paginationFields,
  })
  .openapi('GatheringSpotPage');

export const gatheringSpotListResultSchema = z
  .union([gatheringSpotListResponseSchema, gatheringSpotPageResponseSchema])
  .openapi('GatheringSpotListResult');

export const gatheringMemberResponseSchema = z
  .object({
    gathering_group_member_id: z.number().int(),
    gathering_id: z.number().int(),
    user_id: z.number().int(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('GatheringMember');

export type GatheringMemberResponseDTO = z.infer<
  typeof gatheringMemberResponseSchema
>;

export const gatheringMemberListResponseSchema = z
  .array(gatheringMemberResponseSchema)
  .openapi('GatheringMemberList');

export type GatheringMemberListResponseDTO = z.infer<
  typeof gatheringMemberListResponseSchema
>;

export const gatheringResponseSchema = z
  .object({
    gathering_id: z.number().int(),
    event_id: z.number().int(),
    gathering_spot_id: z.number().int(),
    gathering_time: z.string().openapi({
      description: 'HH:MM形式。99:59は集合時刻が未設定であることを表す。',
      example: '08:45',
    }),
    round: z.number().int(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    event_name: z.string(),
    gathering_spot_name: z.string(),
  })
  .openapi('Gathering');

export type GatheringResponseDTO = z.infer<typeof gatheringResponseSchema>;

export const gatheringListResponseSchema = z
  .array(gatheringResponseSchema)
  .openapi('GatheringList');

export type GatheringListResponseDTO = z.infer<
  typeof gatheringListResponseSchema
>;

export const gatheringSpotIdParams = z.object({
  gatheringSpotId: positivePathParam('gatheringSpotId', '集合場所ID'),
});
export const gatheringIdParams = z.object({
  gatheringId: positivePathParam('gatheringId', '集合予定ID'),
});

export const gatheringSpotWriteSchema = z
  .object({
    gatheringSpotName: z.string().trim().min(1),
  })
  .openapi(
    'GatheringSpotWriteRequest'
  ) satisfies z.ZodType<UpdateGatheringSpotRequestDTO>;

export const gatheringSpotListQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ param: { name: 'limit', in: 'query' }, example: 20 }),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .openapi({ param: { name: 'offset', in: 'query' }, example: 0 }),
  name: z
    .string()
    .trim()
    .max(100)
    .optional()
    .openapi({ param: { name: 'name', in: 'query' } }),
  sortBy: z
    .enum(['id', 'name', 'createdAt', 'updatedAt'])
    .optional()
    .openapi({ param: { name: 'sortBy', in: 'query' } }),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .openapi({ param: { name: 'sortOrder', in: 'query' } }),
}) satisfies z.ZodType<GatheringSpotListOptions, z.ZodTypeDef, unknown>;

export const replaceGatheringMembersSchema = z
  .object({
    // 1集合(=1チーム)の参加者は最大30人の運用のため上限を設ける。
    // D1は1クエリあたりのバインド変数が100個までで、追加1人につき
    // gathering_id/user_idの2個を消費するため、30人(=60個)を超えると
    // 51人以上の追加でPUTが500になる。件数上限はWorkerの実行時間と
    // D1負荷を抑える目的も兼ねる。
    user_ids: z
      .array(z.number().int().positive())
      .max(30, { message: 'user_idsは30件までです' })
      .refine(ids => new Set(ids).size === ids.length, {
        message: 'user_idsに重複があります',
      }),
  })
  .openapi('ReplaceGatheringMembersRequest');

export const gatheringSpotListRoute = createRoute({
  method: 'get',
  path: '/gathering-spots',
  tags: ['Gathering spots'],
  summary: '集合場所一覧を取得する',
  security: bearerAuth,
  request: { query: gatheringSpotListQuery },
  responses: {
    200: jsonResponse(gatheringSpotListResultSchema, '集合場所一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringSpotCreateRoute = createRoute({
  method: 'post',
  path: '/gathering-spots',
  tags: ['Gathering spots'],
  summary: '集合場所を作成する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: gatheringSpotWriteSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(gatheringSpotResponseSchema, '作成した集合場所'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringSpotUpdateRoute = createRoute({
  method: 'put',
  path: '/gathering-spots/{gatheringSpotId}',
  tags: ['Gathering spots'],
  summary: '集合場所を更新する',
  security: bearerAuth,
  request: {
    params: gatheringSpotIdParams,
    body: {
      content: { 'application/json': { schema: gatheringSpotWriteSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(gatheringSpotResponseSchema, '更新した集合場所'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringSpotDeleteRoute = createRoute({
  method: 'delete',
  path: '/gathering-spots/{gatheringSpotId}',
  tags: ['Gathering spots'],
  summary: '集合場所を削除する',
  security: bearerAuth,
  request: { params: gatheringSpotIdParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringMemberListRoute = createRoute({
  method: 'get',
  path: '/gatherings/{gatheringId}/members',
  tags: ['Gathering members'],
  summary: '集合予定の参加者一覧を取得する',
  security: bearerAuth,
  request: { params: gatheringIdParams },
  responses: {
    200: jsonResponse(gatheringMemberListResponseSchema, '参加者一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringMemberReplaceRoute = createRoute({
  method: 'put',
  path: '/gatherings/{gatheringId}/members',
  tags: ['Gathering members'],
  summary: '集合予定の参加者集合を一括で置き換える',
  security: bearerAuth,
  request: {
    params: gatheringIdParams,
    body: {
      content: {
        'application/json': { schema: replaceGatheringMembersSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(gatheringMemberListResponseSchema, '更新後の参加者一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringListRoute = createRoute({
  method: 'get',
  path: '/gatherings',
  tags: ['Gatherings'],
  summary: '集合予定一覧を取得する',
  security: bearerAuth,
  responses: {
    200: jsonResponse(gatheringListResponseSchema, '集合予定一覧'),
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});
