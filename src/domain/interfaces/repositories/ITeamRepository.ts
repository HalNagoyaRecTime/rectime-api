import {
  RankingEntryEntity,
  RankingListOptions,
  TeamEntity,
  TeamListOptions,
  TeamWriteInput,
} from '../../entities/Team';

export interface ITeamRepository {
  findRanking: (
    options: RankingListOptions
  ) => Promise<{ items: RankingEntryEntity[]; total: number }>;
  findAllTeams: (
    options: TeamListOptions
  ) => Promise<{ items: TeamEntity[]; total: number }>;
  findTeamById: (teamId: number) => Promise<TeamEntity | null>;
  exists: (teamId: number) => Promise<boolean>;
  existsClassCodes: (classCodes: string[]) => Promise<boolean>;
  createTeam: (input: TeamWriteInput) => Promise<TeamEntity>;
  updateTeam: (
    teamId: number,
    input: TeamWriteInput
  ) => Promise<TeamEntity | null>;
  addScore: (teamId: number, points: number) => Promise<TeamEntity>;
}
