import type { NotificationDateRangeQueryDTO } from '../dto/AdminNotificationDTO';
import type {
  NotificationScheduleDetailDTO,
  NotificationScheduleListResponseDTO,
} from '../dto/NotificationScheduleDTO';

export interface INotificationScheduleQueryService {
  getNotificationSchedules(
    query: NotificationDateRangeQueryDTO
  ): Promise<NotificationScheduleListResponseDTO>;
  getNotificationScheduleById(
    notificationScheduleId: number
  ): Promise<NotificationScheduleDetailDTO | null>;
}
