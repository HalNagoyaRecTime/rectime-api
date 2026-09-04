export interface TeamScoreEntity {
  team_id: number;
  team_name: string;
  scores: number;
}

export interface RankingEntryEntity extends TeamScoreEntity {
  rank: number;
}

export interface RankingListOptions {
  limit: number;
  offset: number;
}
