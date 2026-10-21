export interface GatheringSpotEntity {
  gathering_spot_id: number;
  gathering_spot_name: string;
  image_key: string | null;
  created_at: string;
  updated_at: string;
  lock_version: number;
}

export interface GatheringSpotListOptions {
  limit: number;
  offset: number;
  name?: string;
  sortBy?: GatheringSpotSortBy;
  sortOrder?: GatheringSpotSortOrder;
}

export type GatheringSpotSortBy = 'id' | 'name' | 'createdAt' | 'updatedAt';
export type GatheringSpotSortOrder = 'asc' | 'desc';

export interface GatheringSpotPage {
  gathering_spots: GatheringSpotEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateGatheringSpotInput {
  gathering_spot_name: string;
  // 取得時点の lock_version。指定された場合だけ、更新時点で値が変わっていないことを確認する。
  expected_lock_version?: number;
}
