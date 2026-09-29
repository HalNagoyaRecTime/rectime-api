import type {
  AdminNotificationQueryOptions,
  AdminNotificationSnapshot,
} from '../../entities/AdminNotificationQuery';

export interface IAdminNotificationQueryRepository {
  findAll(
    options: AdminNotificationQueryOptions
  ): Promise<AdminNotificationSnapshot[]>;
  findById(notificationId: number): Promise<AdminNotificationSnapshot | null>;
}
