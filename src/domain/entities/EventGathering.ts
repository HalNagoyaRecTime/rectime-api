// Event単位で扱う前提のため event_id / event_name は持たない。
export interface EventGatheringEntity {
  gathering_id: number;
  round: number;
  gathering_time: string;
  round_start_time: string | null;
  gathering_spot_id: number;
  gathering_spot_name: string;
  gathering_spot_image_key: string | null;
  member_count: number;
}

export type EventGatheringWithoutMemberCountEntity = Omit<
  EventGatheringEntity,
  'member_count'
>;

export interface EventGatheringWriteInput {
  round: number;
  gathering_time: string;
  round_start_time?: string | null;
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
  // 作成する集合予定にはIDが無いため、Event内で一意な round・集合時刻・
  // 集合場所の組で集合予定を指す。
  member_assignments?: GatheringMemberAssignment[];
}

export interface GatheringMemberAssignment {
  round: number;
  gathering_time: string;
  gathering_spot_id: number;
  user_ids: number[];
}
