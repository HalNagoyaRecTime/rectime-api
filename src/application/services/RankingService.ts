import type {
  RankingEntryEntity,
  TeamEntity,
} from '../../domain/entities/Team';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';
import type {
  AddTeamScoreRequestDTO,
  GetRankingRequestDTO,
  RankingEntryDTO,
  RankingListResponseDTO,
  TeamDTO,
} from '../dto/RankingDTO';
import type { IRankingService } from './IRankingService';
import type { SharedResultCache } from './SharedResultCache';

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
  teamRepository: ITeamRepository,
  sharedRankings: SharedResultCache<RankingListResponseDTO>
): IRankingService {
  const loadRanking = async (
    options: GetRankingRequestDTO
  ): Promise<RankingListResponseDTO> => {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const offset = options.offset ?? DEFAULT_OFFSET;
    const result = await teamRepository.findRanking({
      search: options.search,
      limit,
      offset,
    });
    return {
      items: result.items.map(toRankingEntryDTO),
      total: result.total,
      limit,
      offset,
    };
  };

  return {
    getRanking(options, allowShared) {
      if (allowShared) {
        return sharedRankings.get(JSON.stringify(options), () =>
          loadRanking(options)
        );
      }
      return loadRanking(options);
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
