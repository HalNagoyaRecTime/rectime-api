import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  bearerAuth,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  unauthorizedResponse,
  z,
} from './schemas';

export const masterImportTypeSchema = z
  .enum(['students', 'classrooms', 'teachers'])
  .openapi('MasterImportType');

export const masterImportCommittedResultSchema = z
  .object({
    imported: z.number().int(),
    error_count: z.number().int(),
    errors: z.array(z.unknown()),
  })
  .openapi('MasterImportCommittedResult');

export const masterImportSessionSchema = z
  .object({
    validated_file_id: z.string(),
    type: masterImportTypeSchema,
    status: z.enum(['validated', 'committed']),
    file_name: z.string(),
    total: z.number().int(),
    success_count: z.number().int(),
    error_count: z.number().int(),
    errors: z.array(z.unknown()),
    rows: z.array(z.unknown()),
    rows_total: z.number().int(),
    rows_limit: z.number().int(),
    rows_offset: z.number().int(),
    created_at: z.string(),
    committed_result: masterImportCommittedResultSchema.nullable(),
  })
  .openapi('MasterImportSession');

export type MasterImportSessionResponseDTO = z.infer<
  typeof masterImportSessionSchema
>;

export const validatedFileIdParams = z.object({
  validatedFileId: z
    .string()
    .min(1)
    .openapi({
      param: { name: 'validatedFileId', in: 'path' },
      description: '検証済みファイルID',
    }),
});

export const masterImportRowsQuery = z.object({
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .optional()
    .openapi({
      param: { name: 'offset', in: 'query' },
      example: 0,
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(2000)
    .default(100)
    .optional()
    .openapi({ param: { name: 'limit', in: 'query' }, example: 100 }),
});

export const masterImportCreateSchema = z
  .object({
    type: masterImportTypeSchema,
    file: z.instanceof(File).openapi({ type: 'string', format: 'binary' }),
  })
  .openapi('CreateMasterImportRequest');

export const masterImportCreateRoute = createRoute({
  method: 'post',
  path: '/master-imports',
  tags: ['Master imports'],
  summary: 'マスタ取込ファイルを検証する',
  security: bearerAuth,
  request: {
    body: {
      content: {
        'multipart/form-data': { schema: masterImportCreateSchema },
      },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(masterImportSessionSchema, '検証結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    500: internalServerErrorResponse,
  },
});

export const masterImportDetailRoute = createRoute({
  method: 'get',
  path: '/master-imports/{validatedFileId}',
  tags: ['Master imports'],
  summary: 'マスタ取込の検証結果を取得する',
  security: bearerAuth,
  request: {
    params: validatedFileIdParams,
    query: masterImportRowsQuery,
  },
  responses: {
    200: jsonResponse(masterImportSessionSchema, '検証結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const masterImportCommitRoute = createRoute({
  method: 'post',
  path: '/master-imports/{validatedFileId}/commit',
  tags: ['Master imports'],
  summary: 'マスタ取込を確定する',
  security: bearerAuth,
  request: { params: validatedFileIdParams },
  responses: {
    200: jsonResponse(masterImportSessionSchema, '確定済み（再実行）'),
    201: jsonResponse(masterImportSessionSchema, '確定した取込結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    422: jsonResponse(
      masterImportSessionSchema,
      '検証エラーが残っているため確定できない'
    ),
    500: internalServerErrorResponse,
    503: jsonResponse(
      z.object({
        error: z.string(),
        error_code: z.literal('COMMIT_IN_PROGRESS'),
      }),
      '確定処理が進行中。Retry-Afterヘッダの秒数を空けて再試行する'
    ),
  },
});
