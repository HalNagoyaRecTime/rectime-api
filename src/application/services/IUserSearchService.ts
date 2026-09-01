import type {
  UserSearchQueryDTO,
  UserSearchResponseDTO,
} from '../dto/UserSearchDTO';

export interface IUserSearchService {
  canSearchUsers(userId: number): Promise<boolean>;
  searchUsers(query: UserSearchQueryDTO): Promise<UserSearchResponseDTO>;
}
