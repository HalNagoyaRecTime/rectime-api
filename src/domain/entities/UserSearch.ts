export type UserSearchCategory = 'student' | 'teacher';

export type UserSearchCategoryFilter = 'all' | UserSearchCategory;
export type UserSearchStatusFilter = 'active' | 'inactive' | 'all';

export interface UserSearchFilter {
  q?: string;
  category: UserSearchCategoryFilter;
  status: UserSearchStatusFilter;
  limit: number;
  offset: number;
}

export interface UserSearchItem {
  user_id: number;
  display_name: string;
  is_live_active: boolean;
  categories: UserSearchCategory[];
}

export interface UserSearchResult {
  items: UserSearchItem[];
  total: number;
}
