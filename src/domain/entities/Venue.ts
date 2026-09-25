export interface VenueEntity {
  venue_id: number;
  venue_name: string;
  created_at: string;
  updated_at: string;
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
}
