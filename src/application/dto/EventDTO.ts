import type { RoundSettingDTO } from './EventGatheringSettingsDTO';

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

/**
 * GET /events/:eventId のレスポンス本文。
 * 一覧や作成・更新のレスポンスへ `rounds` を波及させないため、EventDTOとは別に定義する。
 */
export interface EventDetailDTO extends EventDTO {
  rounds: RoundSettingDTO[];
}

/** イベント一覧に含める集合概要。 */
export interface GatheringSummaryDTO {
  gathering_count: number;
  configured_gathering_count: number;
  first_gathering_time: string | null;
}

/** GET /events の一覧項目として返すイベント。 */
export interface EventListItemDTO extends EventDTO {
  gathering_summary: GatheringSummaryDTO;
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

/**
 * PUT /events/:eventId のリクエスト本文。
 * Event本体の項目だけを受け付け、Notification固有fieldは含まない(#388)。
 */
export type UpdateEventRequestDTO = CreateEventRequestDTO;

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
  events: EventListItemDTO[];
  total: number;
  limit: number;
  offset: number;
}
