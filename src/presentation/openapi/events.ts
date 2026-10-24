import { createRoute } from '@hono/zod-openapi';
import type {
  CreateEventRequestDTO,
  EventDetailDTO,
  MyEventDTO,
  GetEventsRequestDTO,
  UpdateEventRequestDTO,
} from '../../application/dto/EventDTO';
import { eventVenueListResponseSchema, venueIdsSchema } from './eventVenues';
import { roundSettingResponseSchema } from './gatheringRounds';
import {
  badRequestResponse,
  bearerAuth,
  conflictResponse,
  forbiddenResponse,
  hhmmSchema,
  internalServerErrorResponse,
  jsonResponse,
  noContentResponse,
  notFoundResponse,
  paginationFields,
  positivePathParam,
  unauthorizedResponse,
  z,
} from './schemas';

export const eventResponseSchema = z
  .object({
    event_id: z.number().int(),
    event_name: z.string(),
    rule_text: z.string().nullable(),
    venues: eventVenueListResponseSchema,
    start_time: hhmmSchema,
    end_time: hhmmSchema,
    created_at: z.string(),
    updated_at: z.string(),
    lock_version: z.number().int().min(0).openapi({
      description:
        '更新の競合を検出するための版番号。更新のたびに1ずつ増える。更新時に `lock_version` として送り返す。',
    }),
  })
  .openapi('Event');

export type EventResponseDTO = z.infer<typeof eventResponseSchema>;

// Application DTO と食い違うと型エラーになるよう、schemaの出力型をDTOで固定する。
export const eventDetailResponseSchema = eventResponseSchema
  .extend({
    rounds: z.array(roundSettingResponseSchema),
  })
  .openapi('EventDetail') satisfies z.ZodType<EventDetailDTO>;

export const gatheringSummaryResponseSchema = z
  .object({
    gathering_count: z.number().int(),
    configured_gathering_count: z.number().int(),
    first_gathering_time: z.string().nullable(),
  })
  .openapi('GatheringSummary');

export const eventListItemResponseSchema = eventResponseSchema
  .extend({
    gathering_summary: gatheringSummaryResponseSchema,
  })
  .openapi('EventListItem');

export const eventListResponseSchema = z
  .object({
    event_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .openapi({
        description:
          'JSTの開催日（YYYY-MM-DD）。EVENT_DATEが未設定・不正ならnull。',
      }),
    events: z.array(eventListItemResponseSchema),
    ...paginationFields,
  })
  .openapi('EventList');

export type EventListResponseDTO = z.infer<typeof eventListResponseSchema>;

export const eventIdParams = z.object({
  eventId: positivePathParam('eventId', 'イベントID'),
});

export const eventListQuery = z.object({
  start_time: hhmmSchema.optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
}) satisfies z.ZodType<GetEventsRequestDTO, z.ZodTypeDef, unknown>;

type EventWriteRequest = Omit<CreateEventRequestDTO, 'rule_text'> & {
  rule_text?: CreateEventRequestDTO['rule_text'];
};

const eventTimeRangeRefinement = {
  message: 'end_time must be after start_time',
  path: ['end_time'],
};
const isValidEventTimeRange = (data: {
  start_time: string;
  end_time: string;
}) => data.start_time < data.end_time;

const eventBaseSchema = z.object({
  event_name: z.string().trim().min(1).max(100),
  rule_text: z.string().max(1000).nullable().optional(),
  venue_ids: venueIdsSchema,
  start_time: hhmmSchema,
  end_time: hhmmSchema,
});

export const eventWriteSchema = eventBaseSchema
  .refine(isValidEventTimeRange, eventTimeRangeRefinement)
  .openapi('EventWriteRequest', {
    description: 'start_timeはend_timeより前の時刻を指定する。',
  }) satisfies z.ZodType<EventWriteRequest>;

// notification_enabled等の未知fieldを黙って無視すると「通知を止めたつもりが
// 実は止まっていない」事故につながるため、PUTはstrictで未知fieldを拒否する(#388)。
export const eventUpdateSchema = eventBaseSchema
  .extend({
    lock_version: z.number().int().min(0).optional().openapi({
      description:
        '取得時点の `lock_version`。指定すると、取得後に変更されていた場合は409を返す。',
    }),
  })
  .strict()
  .refine(isValidEventTimeRange, eventTimeRangeRefinement)
  .openapi('EventUpdateRequest', {
    description: 'start_timeはend_timeより前の時刻を指定する。',
  }) satisfies z.ZodType<
  EventWriteRequest & Pick<UpdateEventRequestDTO, 'lock_version'>
>;

export const eventListRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['Events'],
  summary: 'イベント一覧を取得する',
  security: bearerAuth,
  request: { query: eventListQuery },
  responses: {
    200: jsonResponse(eventListResponseSchema, 'イベント一覧'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    500: internalServerErrorResponse,
  },
});

export const eventDetailRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを取得する',
  description: [
    'Event基本情報に加えて、配下の集合予定を `rounds[].gatherings[]` として返す。',
    'Round専用のテーブルは無く `gatherings.round` でRoundを表すため、集合予定を',
    '1件も持たないRoundは現れない。集合予定が0件のEventは `rounds: []` を返す。',
    '',
    '並び順は `round` 昇順、同一Round内は `gathering_id` 昇順。',
    'rounds[].start_timeはHHmm形式。開始時刻がnullでない最小の集合IDの値を返し、全件nullならnull。',
    '`member_count` は集合予定ごとの参加者数。',
  ].join('\n'),
  security: bearerAuth,
  request: { params: eventIdParams },
  responses: {
    200: jsonResponse(eventDetailResponseSchema, 'イベント'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const eventCreateRoute = createRoute({
  method: 'post',
  path: '/events',
  tags: ['Events'],
  summary: 'イベントを作成する',
  security: bearerAuth,
  request: {
    body: {
      content: { 'application/json': { schema: eventWriteSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(eventResponseSchema, '作成したイベント'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});

export const eventUpdateRoute = createRoute({
  method: 'put',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを更新する',
  description:
    '`lock_version` を指定すると、取得後にイベントが変更されていた場合は409を返す。集合設定の保存でもこの版が進むため、集合設定を保存した後に古い値で送ると409になる。',
  security: bearerAuth,
  request: {
    params: eventIdParams,
    body: {
      content: { 'application/json': { schema: eventUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(eventResponseSchema, '更新したイベント'),
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

export const eventDeleteRoute = createRoute({
  method: 'delete',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを削除する',
  security: bearerAuth,
  request: { params: eventIdParams },
  responses: {
    204: noContentResponse,
    400: badRequestResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse,
    404: notFoundResponse,
    409: conflictResponse,
    500: internalServerErrorResponse,
  },
});

/** 本人の参加情報。イベント本文・時刻・会場はイベントAPIから取得する。 */
export const myEventResponseSchema = z
  .object({
    event_id: z.number().int().positive(),
    gathering_ids: z.array(z.number().int().positive()).openapi({
      description:
        '本人が所属する集合ID。重複なし、ID昇順。時刻・場所はイベント詳細のroundsと照合する。',
    }),
  })
  .openapi('MyEvent') satisfies z.ZodType<MyEventDTO>;

export const myEventsRoute = createRoute({
  method: 'get',
  path: '/me/events',
  tags: ['Events'],
  security: bearerAuth,
  description:
    '本人が参加するイベントIDと集合IDのみを開始時刻・イベントID順で返す。イベント情報はイベントAPIから取得する。未参加はeventsが空配列。',
  responses: {
    200: jsonResponse(
      z.object({ events: z.array(myEventResponseSchema) }),
      '本人の参加予定'
    ),
    401: unauthorizedResponse,
    500: internalServerErrorResponse,
  },
});
