import { createRoute } from '@hono/zod-openapi';
import { MASTER_IMPORT_EXCLUSION_REASONS } from '../../domain/entities/MasterImport';
import { MasterImportErrors } from '../errors/masterImportErrors';
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

export const masterImportExcludedRowSchema = z
  .object({
    row_index: z
      .number()
      .int()
      .openapi({ description: 'ファイルのデータ行を1から数えた行番号' }),
    class_code: z.string(),
    attendance_number: z.number().int(),
    student_id_number: z.string(),
    display_name: z.string(),
    student_id: z
      .number()
      .int()
      .openapi({ description: '同じ学籍番号で登録済みの学生のID' }),
    user_id: z.number().int().openapi({
      description:
        '登録済みの学生のユーザーID。student_already_registered_inactive の学生は PATCH /admin/users/{userId} で is_live_active を true にすると有効化できる。student_account_deleted の学生は有効化できない',
    }),
    reason: z.enum(MASTER_IMPORT_EXCLUSION_REASONS).openapi({
      description:
        'student_already_registered: 登録済みの学生。student_already_registered_inactive: 登録済みだが無効化されている学生。student_account_deleted: 退会手続き中または退会済みの学生。退会しても学生情報は残り、本人が同じ学校アカウントで再ログインすると再び関連付けられる',
    }),
  })
  .openapi('MasterImportExcludedRow');

export const masterImportSessionSchema = z
  .object({
    validated_file_id: z.string(),
    type: masterImportTypeSchema,
    status: z.enum(['validated', 'committed']),
    file_name: z.string(),
    total: z.number().int(),
    success_count: z.number().int().openapi({
      description: '登録する行の数。エラーの行と除外する行は含まない',
    }),
    error_count: z.number().int(),
    errors: z.array(z.unknown()),
    excluded_count: z.number().int().openapi({
      description:
        '既に登録済みの学籍番号のため、登録せずに除外する行の数。学生の取込以外は常に0',
    }),
    excluded: z.array(masterImportExcludedRowSchema),
    rows: z.array(z.unknown()),
    rows_total: z.number().int(),
    rows_limit: z.number().int(),
    rows_offset: z.number().int(),
    created_at: z.string(),
    expires_at: z.string(),
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

const commitInProgressErrorSchema = z.object({
  error: z.object({
    code: z.literal(MasterImportErrors.COMMIT_IN_PROGRESS.code),
    message: z.string(),
  }),
});

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
    503: {
      ...jsonResponse(
        commitInProgressErrorSchema,
        '確定処理が進行中。Retry-Afterヘッダーの秒数後に再試行する'
      ),
      headers: {
        'Retry-After': {
          description: '再試行まで待機する秒数',
          schema: { type: 'string', example: '3' },
        },
      },
    },
  },
});
