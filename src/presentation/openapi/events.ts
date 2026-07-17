import { createRoute } from '@hono/zod-openapi';
import {
  badRequestResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
  positivePathParam,
  timestampSchema,
  z,
} from './schemas';

export const eventResponseSchema = z
  .object({
    event_id: z.number().int(),
    user_id: z.number().int(),
    event_name: z.string(),
    rule_text: z.string().nullable(),
    venue: z.string(),
    // JSTの開始時刻。HHMM形式（例: 0930）。
    start_time: z.string().regex(/^\d{4}$/),
    // JSTの終了時刻。HHMM形式（例: 1030）。
    end_time: z.string().regex(/^\d{4}$/),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('Event');

export type EventResponseDTO = z.infer<typeof eventResponseSchema>;

export const eventListResponseSchema = z
  .object({
    events: z.array(eventResponseSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi('EventList');

export type EventListResponseDTO = z.infer<typeof eventListResponseSchema>;

export const eventIdParams = z.object({
  eventId: positivePathParam('eventId', 'イベントID'),
});

export const eventListQuery = z.object({
  start_time: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const eventListRoute = createRoute({
  method: 'get',
  path: '/events',
  tags: ['Events'],
  summary: 'イベント一覧を取得する',
  request: { query: eventListQuery },
  responses: {
    200: jsonResponse(eventListResponseSchema, 'イベント一覧'),
    400: badRequestResponse,
    500: internalServerErrorResponse,
  },
});

export const eventDetailRoute = createRoute({
  method: 'get',
  path: '/events/{eventId}',
  tags: ['Events'],
  summary: 'イベントを取得する',
  request: { params: eventIdParams },
  responses: {
    200: jsonResponse(eventResponseSchema, 'イベント'),
    400: badRequestResponse,
    404: notFoundResponse,
    500: internalServerErrorResponse,
  },
});
