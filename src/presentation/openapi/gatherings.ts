import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  internalServerErrorResponse,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
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
export const gatheringMemberParams = z.object({
  gatheringId: positivePathParam('gatheringId', '集合予定ID'),
  userId: positivePathParam('userId', '利用者ID'),
});

export const gatheringSpotWriteSchema = z
  .object({
    gatheringSpotName: z.string().trim().min(1),
  })
  .openapi('GatheringSpotWriteRequest');

export const addGatheringMemberSchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .openapi('AddGatheringMemberRequest');

export const createGatheringSchema = z
  .object({
    eventId: z.number().int().positive(),
    gatheringSpotId: z.number().int().positive(),
    gatheringTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^99:59$/)
      .optional()
      .openapi({
        description: 'HH:MM形式。99:59は集合時刻が未設定であることを表す。',
        example: '08:45',
      }),
    round: z.number().int().min(1).max(99).optional(),
  })
  .openapi('CreateGatheringRequest');

export const gatheringSpotListRoute = createRoute({
  method: 'get',
  path: '/gathering-spots',
  tags: ['Gathering spots'],
  summary: '集合場所一覧を取得する',
  security: bearerAuth,
  responses: {
    200: jsonResponse(gatheringSpotListResponseSchema, '集合場所一覧'),
    401: unauthorizedResponse,
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
    404: notFoundResponse,
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

export const gatheringMemberCreateRoute = createRoute({
  method: 'post',
  path: '/gatherings/{gatheringId}/members',
  tags: ['Gathering members'],
  summary: '集合予定へ参加者を追加する',
  security: bearerAuth,
  request: {
    params: gatheringIdParams,
    body: {
      content: { 'application/json': { schema: addGatheringMemberSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(gatheringMemberResponseSchema, '追加した参加情報'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringMemberDeleteRoute = createRoute({
  method: 'delete',
  path: '/gatherings/{gatheringId}/members/{userId}',
  tags: ['Gathering members'],
  summary: '集合予定から参加者を削除する',
  security: bearerAuth,
  request: { params: gatheringMemberParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
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
    500: internalServerErrorResponse,
  },
});

export const gatheringCreateRoute = createRoute({
  method: 'post',
  path: '/gatherings',
  tags: ['Gatherings'],
  summary: '集合予定を作成する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: createGatheringSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(gatheringResponseSchema, '作成した集合予定'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringDeleteRoute = createRoute({
  method: 'delete',
  path: '/gatherings/{gatheringId}',
  tags: ['Gatherings'],
  summary: '集合予定を削除する',
  security: bearerAuth,
  request: { params: gatheringIdParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
