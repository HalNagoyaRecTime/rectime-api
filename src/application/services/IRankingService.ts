import type {
  AddTeamScoreRequestDTO,
  GetRankingRequestDTO,
  RankingListResponseDTO,
  TeamDTO,
} from '../dto/RankingDTO';

export interface IRankingService {
  getRanking: (
    options: GetRankingRequestDTO
  ) => Promise<RankingListResponseDTO>;
  getTeamById: (teamId: number) => Promise<TeamDTO>;
  addTeamScore: (
    teamId: number,
    request: AddTeamScoreRequestDTO
  ) => Promise<TeamDTO>;
}
