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
    scores: z.number().int(),
  })
  .openapi('Team');

export type TeamResponseDTO = z.infer<typeof teamResponseSchema>;

export const rankingListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
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

export const teamDetailRoute = createRoute({
  method: 'get',
  path: '/teams/{teamId}',
  tags: ['Ranking'],
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
