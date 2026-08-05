/** HTTPレスポンスとして返すイベント。 */
export interface EventDTO {
  event_id: number;
  event_name: string;
  rule_text: string | null;
  venue: string;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

/** GET /events のクエリとして受け取る値。 */
export interface GetEventsRequestDTO {
  start_time?: string;
  limit?: number;
  offset?: number;
}

/** POST /events のリクエスト本文。 */
export interface CreateEventRequestDTO {
  event_name: string;
  rule_text: string | null;
  venue: string;
  start_time: string;
  end_time: string;
}

/** PUT /events/:eventId のリクエスト本文。 */
export interface UpdateEventRequestDTO extends CreateEventRequestDTO {
  notification_enabled?: boolean;
}

/** PATCH /events/:eventId のリクエスト本文。 */
export interface PatchEventRequestDTO {
  event_name?: string;
  rule_text?: string | null;
  venue?: string;
  start_time?: string;
  end_time?: string;
  notification_enabled?: boolean;
}

/** GET /events のレスポンス本文。 */
export interface EventListResponseDTO {
  events: EventDTO[];
  total: number;
  limit: number;
  offset: number;
}
