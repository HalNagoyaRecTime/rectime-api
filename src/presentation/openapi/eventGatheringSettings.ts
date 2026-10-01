import { createRoute } from '@hono/zod-openapi';
import type { EventGatheringSettingsDTO } from '../../application/dto/EventGatheringSettingsDTO';
import { eventIdParams } from './events';
import { roundSettingResponseSchema } from './gatheringRounds';
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

// 検証エラーの details は入れ子のパスを先頭の `rounds` にまとめてしまい、
// どの項目で失敗したかが残らない。そのため各制約のメッセージに項目名を含める。
// 文面は Zod の既定メッセージや他ルートの独自メッセージに合わせて英語にする。
const ROUND_RANGE_MESSAGE = 'round must be an integer between 1 and 99';

/**
 * 集合時刻。既存の集合予定作成APIは未設定を表す `99:59` も受け付けるが、
 * 集合設定の保存では実在する時刻だけを正規形式として扱う。
 */
export const gatheringTimeSchema = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d$/,
    'gathering_time must be in HH:mm format'
  )
  .openapi({ description: 'HH:mm形式。', example: '10:45' });

export const gatheringSettingInputSchema = z
  .object({
    gathering_id: z
      .number()
      .int('gathering_id must be a positive integer')
      .positive('gathering_id must be a positive integer')
      .optional()
      .openapi({
        description:
          '指定した場合は対象Event配下の既存Gatheringを更新する。省略した場合は新規作成する。',
      }),
    gathering_time: gatheringTimeSchema,
    gathering_spot_id: z
      .number()
      .int('gathering_spot_id must be a positive integer')
      .positive('gathering_spot_id must be a positive integer'),
  })
  .openapi('GatheringSettingInput');

export const roundSettingInputSchema = z
  .object({
    // 上限は既存の集合予定作成APIと揃える。DBの既定値 99 も同じ範囲に収まる。
    round: z
      .number()
      .int(ROUND_RANGE_MESSAGE)
      .min(1, ROUND_RANGE_MESSAGE)
      .max(99, ROUND_RANGE_MESSAGE),
    // Round専用のテーブルは無く、集合予定が1件も無いRoundは保存できないため
    // 空のRoundは受け付けない。
    gatherings: z
      .array(gatheringSettingInputSchema)
      .min(1, 'gatherings must contain at least one item'),
  })
  .openapi('RoundSettingInput');

/**
 * リクエスト全体の整合性はここで検証する。OpenAPIのルート定義とControllerが
 * 同じschemaを使うことで、受理範囲を一致させる。
 */
export const eventGatheringSettingsWriteSchema = z
  .object({
    rounds: z.array(roundSettingInputSchema),
  })
  .superRefine((value, ctx) => {
    const seenRounds = new Set<number>();
    const seenGatheringIds = new Set<number>();
    value.rounds.forEach((round, roundIndex) => {
      if (seenRounds.has(round.round)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rounds', roundIndex, 'round'],
          message: 'round must not contain duplicate values',
        });
      }
      seenRounds.add(round.round);

      round.gatherings.forEach((gathering, gatheringIndex) => {
        if (gathering.gathering_id === undefined) return;
        if (seenGatheringIds.has(gathering.gathering_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rounds', roundIndex, 'gatherings', gatheringIndex],
            message: 'gathering_id must not contain duplicate values',
          });
        }
        seenGatheringIds.add(gathering.gathering_id);
      });
    });
  })
  .openapi('EventGatheringSettingsWriteRequest');

// Application DTO と食い違うと型エラーになるよう、schemaの出力型をDTOで固定する。
export const eventGatheringSettingsResponseSchema = z
  .object({
    event_id: z.number().int(),
    rounds: z.array(roundSettingResponseSchema),
  })
  .openapi(
    'EventGatheringSettings'
  ) satisfies z.ZodType<EventGatheringSettingsDTO>;

export const eventGatheringSettingsUpdateRoute = createRoute({
  method: 'put',
  path: '/events/{eventId}/gatherings',
  tags: ['Events'],
  summary: 'イベントの集合設定をRound単位でまとめて保存する',
  description: [
    'Event配下の集合予定(gatherings)を、リクエストの内容へ置き換える。',
    'Event基本情報は変更しない。Round専用のテーブルは無く、`gatherings.round` で',
    'Roundを表す。',
    '',
    '`gathering_id` を指定した集合予定は同じIDのまま更新し、省略した集合予定は',
    '新規作成する。リクエストに含まれない既存の集合予定は削除する。',
    '`rounds: []` を送ると、参加者のいない集合予定をすべて削除する。',
    '',
    '参加者(gathering_group_members)は本APIでは追加も削除もしない。',
    '参加者が残っている集合予定がリクエストから外れていた場合は',
    '409 `GATHERING_IN_USE` を返し、何も保存しない。',
    '複数の集合予定の作成・更新・削除は1つのトランザクションで行うため、',
    '一部だけ保存された状態は残らない。',
    '',
    '`gathering_id` が存在しない、または他のEvent配下の場合は',
    '404 `GATHERING_NOT_FOUND` を返す。',
    '集合時刻は `HH:mm` のみを受け付け、未設定を表す `99:59` は400になる。',
    '同じRound番号、同じ `gathering_id` がリクエスト内に2回現れた場合も400。',
    '',
    'レスポンスは保存後の一覧を `round` 昇順、同一Round内は `gathering_time` 昇順、',
    '同時刻は `gathering_id` 昇順で返す。集合予定が0件なら `rounds: []`。',
    '',
    '集合場所を変更しても、作成済みの通知予定(本文に集合場所名を含む)は',
    '再生成しない。通知予定の更新は `PUT /events/{eventId}` の責務とする。',
    '同時更新を検出する楽観ロックは本APIには未導入で、後から保存した内容で',
    '上書きされる。',
  ].join('\n'),
  security: bearerAuth,
  request: {
    params: eventIdParams,
    body: {
      content: {
        'application/json': { schema: eventGatheringSettingsWriteSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(eventGatheringSettingsResponseSchema, '保存後の集合設定'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});
