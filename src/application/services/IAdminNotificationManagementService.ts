import type { ManualNotificationAudience } from '../../domain/entities/AdminNotification';
import type {
  AdminNotificationListOptions,
  AdminNotificationListResult,
  AdminNotificationSummary,
} from '../../domain/entities/AdminNotificationManagement';

export interface UpdateAdminNotificationCommand {
  notification_id: number;
  title?: string;
  body?: string;
  scheduled_at?: string;
  audience?: ManualNotificationAudience;
}

export interface IAdminNotificationManagementService {
  getAdminNotifications(
    options: AdminNotificationListOptions
  ): Promise<AdminNotificationListResult>;
  getAdminNotificationById(
    notificationId: number
  ): Promise<AdminNotificationSummary>;
  updateAdminNotification(
    command: UpdateAdminNotificationCommand
  ): Promise<AdminNotificationSummary>;
  deleteAdminNotification(notificationId: number): Promise<void>;
}
