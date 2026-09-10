/** HTTPレスポンスとして返すランキング1件分。 */
export interface RankingEntryDTO {
  rank: number;
  team_id: number;
  team_name: string;
  scores: number;
}

/** GET /ranking のクエリとして受け取る値。 */
export interface GetRankingRequestDTO {
  limit?: number;
  offset?: number;
}

/** GET /ranking のレスポンス本文。 */
export interface RankingListResponseDTO {
  items: RankingEntryDTO[];
  total: number;
  limit: number;
  offset: number;
}

/** HTTPレスポンスとして返すチーム。 */
export interface TeamDTO {
  team_id: number;
  team_name: string;
  registered_classes: string[];
  scores: number;
  created_at: string;
  updated_at: string;
}

/** GET /teams のクエリとして受け取る値。 */
export interface GetTeamsRequestDTO {
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'teamName' | 'registeredAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

/** GET /teams のレスポンス本文。 */
export interface TeamListResponseDTO {
  items: TeamDTO[];
  total: number;
  limit: number;
  offset: number;
}

/** POST /teams、PUT /teams/:teamId のリクエスト本文。 */
export interface TeamWriteRequestDTO {
  team_name: string;
  class_codes: string[];
}

/** PATCH /teams/:teamId/score のリクエスト本文。 */
export interface AddTeamScoreRequestDTO {
  points: number;
}
