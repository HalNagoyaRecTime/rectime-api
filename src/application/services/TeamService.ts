import type { TeamEntity } from '../../domain/entities/Team';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';
import type {
  GetTeamsRequestDTO,
  TeamDTO,
  TeamWriteRequestDTO,
} from '../dto/RankingDTO';
import type { ITeamService } from './ITeamService';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const DEFAULT_SORT_BY = 'teamName';
const DEFAULT_SORT_ORDER = 'asc';

function toTeamDTO(team: TeamEntity): TeamDTO {
  return {
    team_id: team.team_id,
    team_name: team.team_name,
    registered_classes: team.registered_classes,
    scores: team.scores,
    created_at: team.created_at,
    updated_at: team.updated_at,
  };
}

async function assertClassCodesAssignable(
  teamRepository: ITeamRepository,
  classCodes: string[],
  teamId?: number
) {
  if (classCodes.length === 0) return;

  const classesExist = await teamRepository.existsClassCodes(classCodes);
  if (!classesExist) {
    throw new Error('Class not found');
  }

  const conflicts = await teamRepository.findClassRoomsOwnedByOtherTeam(
    classCodes,
    teamId
  );
  if (conflicts.length > 0) {
    throw new Error('Class already assigned');
  }
}

export function createTeamService(
  teamRepository: ITeamRepository
): ITeamService {
  return {
    async getAllTeams(options: GetTeamsRequestDTO) {
      const limit = options.limit ?? DEFAULT_LIMIT;
      const offset = options.offset ?? DEFAULT_OFFSET;
      const sortBy = options.sortBy ?? DEFAULT_SORT_BY;
      const sortOrder = options.sortOrder ?? DEFAULT_SORT_ORDER;
      const result = await teamRepository.findAllTeams({
        search: options.search,
        limit,
        offset,
        sortBy,
        sortOrder,
      });
      return {
        items: result.items.map(toTeamDTO),
        total: result.total,
        limit,
        offset,
      };
    },

    async getTeamById(teamId: number) {
      const team = await teamRepository.findTeamById(teamId);
      if (!team) {
        throw new Error('Team not found');
      }
      return toTeamDTO(team);
    },

    async createTeam(input: TeamWriteRequestDTO) {
      await assertClassCodesAssignable(teamRepository, input.class_codes);
      return toTeamDTO(await teamRepository.createTeam(input));
    },

    async updateTeam(teamId: number, input: TeamWriteRequestDTO) {
      await assertClassCodesAssignable(
        teamRepository,
        input.class_codes,
        teamId
      );
      const updated = await teamRepository.updateTeam(teamId, input);
      if (!updated) {
        throw new Error('Team not found');
      }
      return toTeamDTO(updated);
    },

    async deleteTeam(teamId: number) {
      const team = await teamRepository.findTeamById(teamId);
      if (!team) {
        throw new Error('Team not found');
      }
      if (team.scores !== 0) {
        throw new Error('Team has scores');
      }
      return await teamRepository.delete(teamId);
    },
  };
}
