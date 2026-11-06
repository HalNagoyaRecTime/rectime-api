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
  search?: string;
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
  class_codes: string[];
}

// チーム名は自由入力せず、所属クラスのclass_codeをスペース区切りで連結した
// 文字列から自動生成する。クラス構成が変わるたびに呼び出し側で再生成する。
export function buildTeamName(classCodes: string[]): string {
  return classCodes.join(' ');
}
