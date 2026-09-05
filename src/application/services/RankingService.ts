import type {
  RankingEntryEntity,
  TeamEntity,
} from '../../domain/entities/Team';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';
import type {
  AddTeamScoreRequestDTO,
  GetRankingRequestDTO,
  RankingEntryDTO,
  TeamDTO,
} from '../dto/RankingDTO';
import type { IRankingService } from './IRankingService';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function toRankingEntryDTO(entry: RankingEntryEntity): RankingEntryDTO {
  return {
    rank: entry.rank,
    team_id: entry.team_id,
    team_name: entry.team_name,
    scores: entry.scores,
  };
}

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

export function createRankingService(
  teamRepository: ITeamRepository
): IRankingService {
  return {
    async getRanking(options: GetRankingRequestDTO) {
      const limit = options.limit ?? DEFAULT_LIMIT;
      const offset = options.offset ?? DEFAULT_OFFSET;
      const result = await teamRepository.findRanking({ limit, offset });
      return {
        items: result.items.map(toRankingEntryDTO),
        total: result.total,
        limit,
        offset,
      };
    },

    async addTeamScore(teamId: number, request: AddTeamScoreRequestDTO) {
      const exists = await teamRepository.exists(teamId);
      if (!exists) {
        throw new Error('Team not found');
      }
      const updated = await teamRepository.addScore(teamId, request.points);
      return toTeamDTO(updated);
    },
  };
}
