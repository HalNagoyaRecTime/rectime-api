import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  conflictResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  positivePathParam,
  timestampSchema,
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

export const gatheringGroupResponseSchema = z
  .object({
    gathering_group_id: z.number().int(),
    gathering_group_name: z.string(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('GatheringGroup');

export type GatheringGroupResponseDTO = z.infer<
  typeof gatheringGroupResponseSchema
>;

export const gatheringGroupListResponseSchema = z
  .array(gatheringGroupResponseSchema)
  .openapi('GatheringGroupList');

export type GatheringGroupListResponseDTO = z.infer<
  typeof gatheringGroupListResponseSchema
>;

export const gatheringGroupMemberResponseSchema = z
  .object({
    gathering_group_member_id: z.number().int(),
    gathering_group_id: z.number().int(),
    user_id: z.number().int(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('GatheringGroupMember');

export type GatheringGroupMemberResponseDTO = z.infer<
  typeof gatheringGroupMemberResponseSchema
>;

export const gatheringGroupMemberListResponseSchema = z
  .array(gatheringGroupMemberResponseSchema)
  .openapi('GatheringGroupMemberList');

export type GatheringGroupMemberListResponseDTO = z.infer<
  typeof gatheringGroupMemberListResponseSchema
>;

export const gatheringResponseSchema = z
  .object({
    gathering_id: z.number().int(),
    gathering_group_id: z.number().int(),
    event_id: z.number().int(),
    gathering_spot_id: z.number().int(),
    gathering_time: z.string(),
    round: z.number().int(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    gathering_group_name: z.string(),
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

export const gatheringGroupIdParams = z.object({
  gatheringGroupId: positivePathParam('gatheringGroupId', '対象グループID'),
});
export const gatheringGroupMemberParams = z.object({
  gatheringGroupId: positivePathParam('gatheringGroupId', '対象グループID'),
  userId: positivePathParam('userId', '利用者ID'),
});

export const createGatheringSpotSchema = z.object({
  gatheringSpotName: z.string().trim().min(1),
});
export const createGatheringGroupSchema = z.object({
  gatheringGroupName: z.string().trim().min(1),
});
export const addGatheringGroupMemberSchema = z.object({
  userId: z.number().int().positive(),
});
export const createGatheringSchema = z.object({
  gatheringGroupId: z.number().int().positive(),
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
});

export const gatheringSpotListRoute = createRoute({
  method: 'get',
  path: '/gathering-spots',
  tags: ['Gathering spots'],
  summary: '集合場所一覧を取得する',
  responses: {
    200: jsonResponse(gatheringSpotListResponseSchema, '集合場所一覧'),
    500: internalServerErrorResponse,
  },
});
export const gatheringSpotCreateRoute = createRoute({
  method: 'post',
  path: '/gathering-spots',
  tags: ['Gathering spots'],
  summary: '集合場所を作成する',
  request: {
    body: {
      content: { 'application/json': { schema: createGatheringSpotSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(gatheringSpotResponseSchema, '作成した集合場所'),
    400: badRequestResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringGroupListRoute = createRoute({
  method: 'get',
  path: '/gathering-groups',
  tags: ['Gathering groups'],
  summary: '対象グループ一覧を取得する',
  responses: {
    200: jsonResponse(gatheringGroupListResponseSchema, '対象グループ一覧'),
    500: internalServerErrorResponse,
  },
});
export const gatheringGroupCreateRoute = createRoute({
  method: 'post',
  path: '/gathering-groups',
  tags: ['Gathering groups'],
  summary: '対象グループを作成する',
  request: {
    body: {
      content: { 'application/json': { schema: createGatheringGroupSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(gatheringGroupResponseSchema, '作成した対象グループ'),
    400: badRequestResponse,
    500: internalServerErrorResponse,
  },
});
export const gatheringGroupMemberListRoute = createRoute({
  method: 'get',
  path: '/gathering-groups/{gatheringGroupId}/members',
  tags: ['Gathering group members'],
  summary: '対象グループの所属者一覧を取得する',
  request: { params: gatheringGroupIdParams },
  responses: {
    200: jsonResponse(gatheringGroupMemberListResponseSchema, '所属者一覧'),
    400: badRequestResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
export const gatheringGroupMemberCreateRoute = createRoute({
  method: 'post',
  path: '/gathering-groups/{gatheringGroupId}/members',
  tags: ['Gathering group members'],
  summary: '対象グループへ所属者を追加する',
  request: {
    params: gatheringGroupIdParams,
    body: {
      content: {
        'application/json': { schema: addGatheringGroupMemberSchema },
      },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(gatheringGroupMemberResponseSchema, '追加した所属情報'),
    400: badRequestResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});
export const gatheringGroupMemberDeleteRoute = createRoute({
  method: 'delete',
  path: '/gathering-groups/{gatheringGroupId}/members/{userId}',
  tags: ['Gathering group members'],
  summary: '対象グループから所属者を削除する',
  request: { params: gatheringGroupMemberParams },
  responses: {
    204: { description: '削除成功' },
    400: badRequestResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringListRoute = createRoute({
  method: 'get',
  path: '/gatherings',
  tags: ['Gatherings'],
  summary: '集合予定一覧を取得する',
  responses: {
    200: jsonResponse(gatheringListResponseSchema, '集合予定一覧'),
    500: internalServerErrorResponse,
  },
});
export const gatheringCreateRoute = createRoute({
  method: 'post',
  path: '/gatherings',
  tags: ['Gatherings'],
  summary: '集合予定を作成する',
  request: {
    body: {
      content: { 'application/json': { schema: createGatheringSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(gatheringResponseSchema, '作成した集合予定'),
    400: badRequestResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});
