import { TeamEntity } from '../../entities/Team';

export interface ITeamRepository {
  create: (teamName: string) => Promise<TeamEntity>;
  exists: (id: number) => Promise<boolean>;
  delete: (id: number) => Promise<boolean>;
}
