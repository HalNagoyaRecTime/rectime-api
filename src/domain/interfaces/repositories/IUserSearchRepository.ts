import type {
  UserSearchFilter,
  UserSearchResult,
} from '../../entities/UserSearch';

export interface IUserSearchRepository {
  findAll(filter: UserSearchFilter): Promise<UserSearchResult>;
}
