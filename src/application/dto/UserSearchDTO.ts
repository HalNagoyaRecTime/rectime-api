import type {
  UserSearchCategory,
  UserSearchCategoryFilter,
  UserSearchStatusFilter,
} from '../../domain/entities/UserSearch';

export interface UserSearchQueryDTO {
  q?: string;
  category: UserSearchCategoryFilter;
  status: UserSearchStatusFilter;
  limit: number;
  offset: number;
}

export interface UserSearchItemDTO {
  user_id: number;
  display_name: string;
  is_live_active: boolean;
  categories: UserSearchCategory[];
}

export interface UserSearchResponseDTO {
  items: UserSearchItemDTO[];
  total: number;
  limit: number;
  offset: number;
}
