// PUT /events/{eventId}/gatherings のリクエスト。
// gathering_id があれば既存の更新、なければ新規作成として扱う。
export interface GatheringSettingInputDTO {
  gathering_id?: number;
  gathering_time: string;
  gathering_spot_id: number;
}

export interface RoundSettingInputDTO {
  round: number;
  start_time?: string | null;
  gatherings: GatheringSettingInputDTO[];
}

export interface EventGatheringSettingsRequestDTO {
  rounds: RoundSettingInputDTO[];
  // 取得時点のEventの lock_version。指定すると、取得後に変更されていた場合は409になる。
  lock_version?: number;
}

// 保存後の正規化済みレスポンス。Event詳細の読み取りでも同じ形を返せるよう、
// Event基本情報とは分けている。
export interface GatheringSpotSummaryDTO {
  gathering_spot_id: number;
  gathering_spot_name: string;
  image_url: string | null;
}

export interface GatheringSettingDTO {
  gathering_id: number;
  gathering_time: string;
  gathering_spot: GatheringSpotSummaryDTO;
  member_count: number;
}

export interface RoundSettingDTO {
  round: number;
  start_time: string | null;
  gatherings: GatheringSettingDTO[];
}

export interface EventGatheringSettingsDTO {
  event_id: number;
  // 保存後のEventの lock_version。次の保存や PUT /events/{eventId} に送り返す。
  lock_version: number;
  rounds: RoundSettingDTO[];
}
