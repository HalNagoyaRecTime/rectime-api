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
  scores: number;
}

/** PATCH /teams/:teamId/score のリクエスト本文。 */
export interface AddTeamScoreRequestDTO {
  points: number;
}
