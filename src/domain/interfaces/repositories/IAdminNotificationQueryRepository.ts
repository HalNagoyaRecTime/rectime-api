import type {
  AdminNotificationQueryOptions,
  AdminNotificationQueryResult,
} from '../../entities/AdminNotificationQuery';

export interface IAdminNotificationQueryRepository {
  findAll(
    options: AdminNotificationQueryOptions
  ): Promise<AdminNotificationQueryResult[]>;
  findById(
    notificationId: number
  ): Promise<AdminNotificationQueryResult | null>;
}
