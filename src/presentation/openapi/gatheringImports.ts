import { createRoute } from '@hono/zod-openapi';
import {
  GATHERING_IMPORT_ERROR_CODES,
  type GatheringImportResultDTO,
} from '../../application/dto/GatheringImportDTO';
import { eventIdParams } from './events';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  unauthorizedResponse,
  z,
} from './schemas';

const rowNumberSchema = z
  .number()
  .int()
  .openapi({ description: 'CSVの行番号。見出しの行を1とする' });

export const gatheringImportResultSchema = z
  .object({
    event_id: z.number().int(),
    lock_version: z.number().int().min(0).openapi({
      description:
        'プレビューでは現在の、確定では保存後のEventの `lock_version`。確定のリクエストに送る',
    }),
    total_rows: z.number().int().openapi({ description: '空行を除いた行数' }),
    imported_rows: z
      .number()
      .int()
      .openapi({ description: '取り込む(取り込んだ)行の数' }),
    excluded_rows: z
      .number()
      .int()
      .openapi({ description: 'エラーのため取り込まない行の数' }),
    rounds: z.array(
      z.object({
        round: z.number().int(),
        start_time: z
          .string()
          .nullable()
          .openapi({ description: 'HHmm形式', example: '1000' }),
        gatherings: z.array(
          z.object({
            gathering_time: z
              .string()
              .openapi({ description: 'HH:mm形式', example: '09:45' }),
            gathering_spot: z.object({
              gathering_spot_id: z.number().int(),
              gathering_spot_name: z.string(),
            }),
            members: z.array(
              z.object({
                row_number: rowNumberSchema,
                user_id: z.number().int(),
                class_code: z.string(),
                attendance_number: z.number().int(),
                user_name: z.string(),
              })
            ),
          })
        ),
      })
    ),
    errors: z.array(
      z.object({
        row_number: rowNumberSchema,
        code: z.enum(GATHERING_IMPORT_ERROR_CODES),
        message: z.string(),
        student: z.string().openapi({ description: '生徒の列の値' }),
      })
    ),
    warnings: z.array(
      z.object({
        row_number: rowNumberSchema,
        code: z.literal('NAME_MISMATCH'),
        message: z.string(),
        student: z.string().openapi({ description: '生徒の列の値' }),
        registered_name: z.string(),
      })
    ),
  })
  .openapi(
    'GatheringImportResult'
  ) satisfies z.ZodType<GatheringImportResultDTO>;

const fileSchema = z
  .instanceof(File)
  .openapi({ type: 'string', format: 'binary' });

export const gatheringImportPreviewSchema = z
  .object({ file: fileSchema })
  .openapi('GatheringImportPreviewRequest');

export const gatheringImportCommitSchema = z
  .object({
    file: fileSchema,
    lock_version: z.coerce.number().int().min(0).openapi({
      description: 'プレビューで返った `lock_version`',
    }),
  })
  .openapi('GatheringImportCommitRequest');

const CSV_DESCRIPTION = [
  'UTF-8のCSV。見出しの行に `ラウンド`・`開始時刻`・`集合時刻`・`集合場所`・`生徒` の列が必要で、',
  'ほかの列は無視する。列の順番は問わない。空行を除いて2,500行までで、超えると400 `GATHERING_IMPORT_TOO_MANY_ROWS`。',
  '',
  '- ラウンド: 1〜99。同じラウンドの行は開始時刻を揃える',
  '- 開始時刻: `H:mm` または `HH:mm`。空欄は未設定',
  '- 集合時刻: `H:mm` または `HH:mm`',
  '- 集合場所: 登録済みの集合場所の名前',
  '- 生徒: Teamsの表示名(`NHIH12A20309 氏名`)。最初の空白までが番号で、末尾2桁を出席番号、',
  '  その前の8文字をクラス記号として生徒を探す。氏名は登録と違うときに警告するだけに使う',
  '',
  'ラウンド・集合時刻・集合場所が同じ行を1つの集合にまとめる。',
  'エラーの行は取り込まない。同じ生徒が複数の行にあるときはその生徒の行をすべて、',
  '同じラウンドで開始時刻が揃っていないときはそのラウンドの行をすべてエラーにする。',
].join('\n');

export const gatheringImportPreviewRoute = createRoute({
  method: 'post',
  path: '/events/{eventId}/gathering-imports/preview',
  tags: ['Events'],
  summary: '集合のCSV取込の結果を、保存せずに確かめる',
  description: CSV_DESCRIPTION,
  security: bearerAuth,
  request: {
    params: eventIdParams,
    body: {
      content: {
        'multipart/form-data': { schema: gatheringImportPreviewSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(gatheringImportResultSchema, '取り込んだ場合の結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const gatheringImportCommitRoute = createRoute({
  method: 'post',
  path: '/events/{eventId}/gathering-imports',
  tags: ['Events'],
  summary: '集合をCSVの内容に置き換える',
  description: [
    CSV_DESCRIPTION,
    '',
    'Eventの集合予定と参加者を、エラーの行を除いたCSVの内容にすべて置き換える。',
    'ラウンド・集合時刻・集合場所が同じ既存の集合予定はそのまま使い、それ以外は削除して',
    '自動通知も削除する。取り込める行が無いときは400 `GATHERING_IMPORT_NO_ROWS` を返し、何も変えない。',
    '`lock_version` が現在の版と違うときは409 `EVENT_UPDATE_CONFLICT` を返し、何も変えない。',
  ].join('\n'),
  security: bearerAuth,
  request: {
    params: eventIdParams,
    body: {
      content: {
        'multipart/form-data': { schema: gatheringImportCommitSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(gatheringImportResultSchema, '取り込んだ結果'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});
