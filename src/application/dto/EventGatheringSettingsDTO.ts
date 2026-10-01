// PUT /events/{eventId}/gatherings のリクエスト。
// gathering_id があれば既存の更新、なければ新規作成として扱う。
export interface GatheringSettingInputDTO {
  gathering_id?: number;
  gathering_time: string;
  gathering_spot_id: number;
}

export interface RoundSettingInputDTO {
  round: number;
  gatherings: GatheringSettingInputDTO[];
}

export interface EventGatheringSettingsRequestDTO {
  rounds: RoundSettingInputDTO[];
}

// 保存後の正規化済みレスポンス。Event詳細の読み取りでも同じ形を返せるよう、
// Event基本情報とは分けている。
export interface GatheringSpotSummaryDTO {
  gathering_spot_id: number;
  gathering_spot_name: string;
}

export interface GatheringSettingDTO {
  gathering_id: number;
  gathering_time: string;
  gathering_spot: GatheringSpotSummaryDTO;
  member_count: number;
}

export interface RoundSettingDTO {
  round: number;
  gatherings: GatheringSettingDTO[];
}

export interface EventGatheringSettingsDTO {
  event_id: number;
  rounds: RoundSettingDTO[];
}
