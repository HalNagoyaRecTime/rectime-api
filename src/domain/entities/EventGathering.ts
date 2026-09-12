// Event配下の集合予定1件。集合設定の保存結果として返す情報を、集合場所名と
// 参加人数まで含めて1回の読み取りで揃える。GatheringDetailsEntity とは違い、
// Event単位で扱う前提のため event_id / event_name は持たない。
export interface EventGatheringEntity {
  gathering_id: number;
  round: number;
  gathering_time: string;
  gathering_spot_id: number;
  gathering_spot_name: string;
  member_count: number;
}

export interface EventGatheringWriteInput {
  round: number;
  gathering_time: string;
  gathering_spot_id: number;
}

export interface EventGatheringUpdateInput extends EventGatheringWriteInput {
  gathering_id: number;
}

// Event単位の集合設定の差分。Application Serviceが現状との比較で組み立て、
// Repositoryは1つのトランザクションでまとめて適用する。
export interface EventGatheringChangeSet {
  event_id: number;
  creates: EventGatheringWriteInput[];
  updates: EventGatheringUpdateInput[];
  delete_ids: number[];
}
