export interface VenueEntity {
  venue_id: number;
  venue_name: string;
  image_key: string | null;
  created_at: string;
  updated_at: string;
  lock_version: number;
}

export type VenueSortBy = 'id' | 'name' | 'createdAt' | 'updatedAt';
export type VenueSortOrder = 'asc' | 'desc';

export interface VenueListOptions {
  limit: number;
  offset: number;
  name?: string;
  sortBy?: VenueSortBy;
  sortOrder?: VenueSortOrder;
}

export interface VenuePage {
  venues: VenueEntity[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateVenueInput {
  venue_name: string;
  // 取得時点の lock_version。指定された場合だけ、更新時点で値が変わっていないことを確認する。
  expected_lock_version?: number;
}
