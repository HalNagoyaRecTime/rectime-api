import type {
  AdminNotificationQueryOptions,
  AdminNotificationQueryResult,
} from '../../entities/AdminNotificationQuery';

export interface AdminNotificationQueryPageInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface AdminNotificationQueryResultWithPagination {
  items: AdminNotificationQueryResult[];
  pagination: AdminNotificationQueryPageInfo;
}

export interface IAdminNotificationQueryRepository {
  findAll(
    options: AdminNotificationQueryOptions
  ): Promise<AdminNotificationQueryResultWithPagination>;
  findById(
    notificationId: number
  ): Promise<AdminNotificationQueryResult | null>;
}
