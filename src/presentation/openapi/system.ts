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
    // DOCS_ENABLED が有効な環境でのみ返る（無効な環境では実体が404のため省く）。
    openapi: z.string().optional(),
    docs: z.string().optional(),
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

export const contactRoute = createRoute({
  method: 'get',
  path: '/app/contact',
  tags: ['System'],
  summary: 'お問い合わせフォームへリダイレクトする',
  description:
    '認証不要。環境変数 CONTACT_FORM_URL のMicrosoft Formsへ302でリダイレクトする。リダイレクト先はクエリ等では変更できない。',
  responses: {
    302: {
      description: 'お問い合わせフォームへリダイレクト',
      headers: z.object({
        Location: z.string().url(),
        'Cache-Control': z.literal('no-store'),
      }),
    },
    503: {
      description:
        'お問い合わせフォームのURLが未設定または不正で、利用できない',
      content: { 'text/html': { schema: z.string() } },
    },
  },
});
