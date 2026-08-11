import { createRoute } from '@hono/zod-openapi';
import { jsonResponse, z } from './schemas';

export const healthResponseSchema = z
  .object({ status: z.literal('ok') })
  .openapi('Health');

export const apiOverviewResponseSchema = z
  .object({
    message: z.string(),
    version: z.string(),
    endpoints: z.record(z.string()),
    openapi: z.string(),
    docs: z.string(),
  })
  .openapi('ApiOverview');

export type ApiOverviewResponseDTO = z.infer<typeof apiOverviewResponseSchema>;

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'ヘルスチェック',
  responses: {
    200: jsonResponse(healthResponseSchema, '正常'),
  },
});

export const apiOverviewRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['System'],
  summary: 'APIの概要を取得する',
  responses: {
    200: jsonResponse(apiOverviewResponseSchema, 'APIの概要'),
  },
});
