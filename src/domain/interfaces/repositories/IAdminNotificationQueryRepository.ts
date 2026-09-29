import type { AdminNotificationSnapshot } from '../../entities/AdminNotificationQuery';

export interface IAdminNotificationQueryRepository {
  findDetail(notificationId: number): Promise<AdminNotificationSnapshot | null>;
}
