import type { AdminNotificationDetailDTO } from '../dto/AdminNotificationDTO';

export interface IAdminNotificationQueryService {
  getNotificationDetail(
    notificationId: number
  ): Promise<AdminNotificationDetailDTO | null>;
}
