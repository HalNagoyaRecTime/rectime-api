export interface TeamEntity {
  team_id: number;
  team_name: string;
  registered_classes: string[];
  scores: number;
  created_at: string;
  updated_at: string;
}

export interface RankingEntryEntity {
  rank: number;
  team_id: number;
  team_name: string;
  scores: number;
}

export interface RankingListOptions {
  limit: number;
  offset: number;
}

export type TeamSortBy = 'teamName' | 'registeredAt' | 'updatedAt';
export type SortOrder = 'asc' | 'desc';

export interface TeamListOptions {
  search?: string;
  limit: number;
  offset: number;
  sortBy: TeamSortBy;
  sortOrder: SortOrder;
}

export interface TeamWriteInput {
  team_name: string;
  class_codes: string[];
}
