import type {
  AddTeamScoreRequestDTO,
  GetRankingRequestDTO,
  RankingListResponseDTO,
  TeamDTO,
} from '../dto/RankingDTO';

export interface IRankingService {
  getRanking: (
    options: GetRankingRequestDTO,
    allowShared?: boolean
  ) => Promise<RankingListResponseDTO>;
  addTeamScore: (
    teamId: number,
    request: AddTeamScoreRequestDTO
  ) => Promise<TeamDTO>;
}
