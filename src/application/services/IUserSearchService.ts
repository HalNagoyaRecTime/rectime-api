import type {
  UserSearchQueryDTO,
  UserSearchResponseDTO,
} from '../dto/UserSearchDTO';

export interface IUserSearchService {
  searchUsers(query: UserSearchQueryDTO): Promise<UserSearchResponseDTO>;
}
