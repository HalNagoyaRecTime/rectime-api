import {
  RankingEntryEntity,
  RankingListOptions,
  TeamScoreEntity,
} from '../../entities/Team';

export interface ITeamRepository {
  findRanking: (
    options: RankingListOptions
  ) => Promise<{ items: RankingEntryEntity[]; total: number }>;
  findByIdWithScore: (teamId: number) => Promise<TeamScoreEntity | null>;
  exists: (teamId: number) => Promise<boolean>;
  addScore: (teamId: number, points: number) => Promise<TeamScoreEntity>;
}
