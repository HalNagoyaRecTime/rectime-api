import type { AdminNotificationDetailDTO } from '../dto/AdminNotificationDTO';
import type {
  AdminNotificationListResponseDTO,
  NotificationDateRangeQueryDTO,
} from '../dto/AdminNotificationDTO';

export interface IAdminNotificationQueryService {
  getAdminNotifications(
    query: NotificationDateRangeQueryDTO
  ): Promise<AdminNotificationListResponseDTO>;
  getAdminNotificationById(
    notificationId: number
  ): Promise<AdminNotificationDetailDTO | null>;
}
