import type {
  NotificationPushDeliveryDetailDTO,
  NotificationScheduleResultsResponseDTO,
  NotificationScheduleResultsQueryDTO,
} from '../dto/NotificationScheduleDTO';

export interface INotificationResultQueryService {
  getScheduleResults(
    notificationScheduleId: number,
    query: NotificationScheduleResultsQueryDTO
  ): Promise<NotificationScheduleResultsResponseDTO | null>;
  getPushDeliveryDetail(
    notificationPushDeliveryId: number
  ): Promise<NotificationPushDeliveryDetailDTO | null>;
}
