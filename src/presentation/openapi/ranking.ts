import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  paginationFields,
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const rankingEntryResponseSchema = z
  .object({
    rank: z.number().int(),
    team_id: z.number().int(),
    team_name: z.string(),
    scores: z.number().int(),
  })
  .openapi('RankingEntry');

export type RankingEntryResponseDTO = z.infer<
  typeof rankingEntryResponseSchema
>;

export const rankingListResponseSchema = z
  .object({
    items: z.array(rankingEntryResponseSchema),
    ...paginationFields,
  })
  .openapi('RankingList');

export type RankingListResponseDTO = z.infer<typeof rankingListResponseSchema>;

export const teamResponseSchema = z
  .object({
    team_id: z.number().int(),
    team_name: z.string(),
    registered_classes: z.array(z.string()),
    scores: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi('Team');

export type TeamResponseDTO = z.infer<typeof teamResponseSchema>;

export const teamListResponseSchema = z
  .object({
    items: z.array(teamResponseSchema),
    ...paginationFields,
  })
  .openapi('TeamList');

export type TeamListResponseDTO = z.infer<typeof teamListResponseSchema>;

export const rankingListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const teamListQuery = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sortBy: z.enum(['teamName', 'registeredAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const teamIdParams = z.object({
  teamId: positivePathParam('teamId', 'チームID'),
});

export const teamScoreAddSchema = z
  .object({
    points: z.number().int().openapi({
      description: '加算する得点。訂正する場合は負の値を渡す。',
      example: 10,
    }),
  })
  .openapi('TeamScoreAddRequest');

export const teamWriteSchema = z
  .object({
    team_name: z.string().trim().min(1),
    class_codes: z.array(z.string().trim().min(1)).openapi({
      description:
        '所属させるクラスのclass_code一覧。重複した値は含められない。',
    }),
  })
  .openapi('TeamWriteRequest');

export const rankingListRoute = createRoute({
  method: 'get',
  path: '/ranking',
  tags: ['Ranking'],
  summary: 'チーム別ランキング一覧を取得する',
  security: bearerAuth,
  request: { query: rankingListQuery },
  responses: {
    200: jsonResponse(rankingListResponseSchema, 'ランキング一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    500: internalServerErrorResponse,
  },
});

export const teamListRoute = createRoute({
  method: 'get',
  path: '/teams',
  tags: ['Teams'],
  summary: 'チーム一覧を取得する',
  security: bearerAuth,
  request: { query: teamListQuery },
  responses: {
    200: jsonResponse(teamListResponseSchema, 'チーム一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const teamCreateRoute = createRoute({
  method: 'post',
  path: '/teams',
  tags: ['Teams'],
  summary: 'チームを作成する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: teamWriteSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(teamResponseSchema, '作成したチーム'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const teamDetailRoute = createRoute({
  method: 'get',
  path: '/teams/{teamId}',
  tags: ['Teams'],
  summary: 'チームを取得する',
  security: bearerAuth,
  request: { params: teamIdParams },
  responses: {
    200: jsonResponse(teamResponseSchema, 'チーム'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const teamUpdateRoute = createRoute({
  method: 'put',
  path: '/teams/{teamId}',
  tags: ['Teams'],
  summary: 'チームを更新する',
  security: bearerAuth,
  request: {
    params: teamIdParams,
    body: {
      content: { 'application/json': { schema: teamWriteSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(teamResponseSchema, '更新したチーム'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const teamScoreAddRoute = createRoute({
  method: 'patch',
  path: '/teams/{teamId}/score',
  tags: ['Ranking'],
  summary: 'チームの得点を加算する',
  security: bearerAuth,
  request: {
    params: teamIdParams,
    body: {
      content: { 'application/json': { schema: teamScoreAddSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(teamResponseSchema, '得点を加算したチーム'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
