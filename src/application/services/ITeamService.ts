import type {
  GetTeamsRequestDTO,
  TeamDTO,
  TeamListResponseDTO,
  TeamWriteRequestDTO,
} from '../dto/RankingDTO';

export interface ITeamService {
  getAllTeams: (options: GetTeamsRequestDTO) => Promise<TeamListResponseDTO>;
  getTeamById: (teamId: number) => Promise<TeamDTO>;
  createTeam: (input: TeamWriteRequestDTO) => Promise<TeamDTO>;
  updateTeam: (teamId: number, input: TeamWriteRequestDTO) => Promise<TeamDTO>;
}
