import type { IUserSearchRepository } from '../../domain/interfaces/repositories/IUserSearchRepository';
import type {
  UserSearchFilter,
  UserSearchResult,
} from '../../domain/entities/UserSearch';
import type {
  UserSearchQueryDTO,
  UserSearchResponseDTO,
} from '../dto/UserSearchDTO';
import type { IUserSearchService } from './IUserSearchService';

export function createUserSearchService(
  userSearchRepository: IUserSearchRepository
): IUserSearchService {
  return {
    async searchUsers(
      query: UserSearchQueryDTO
    ): Promise<UserSearchResponseDTO> {
      const filter: UserSearchFilter = {
        q: query.q,
        category: query.category,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      };
      const result: UserSearchResult =
        await userSearchRepository.findAll(filter);

      return {
        items: result.items,
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      };
    },
  };
}
