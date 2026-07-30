import type {
  AdminNotificationListOptions,
  AdminNotificationListResult,
  AdminNotificationSummary,
  DeleteAdminNotificationResult,
  UpdateAdminNotificationInput,
  UpdateAdminNotificationResult,
} from '../../entities/AdminNotificationManagement';

export interface IAdminNotificationManagementRepository {
  findAll(
    options: AdminNotificationListOptions
  ): Promise<AdminNotificationListResult>;
  findById(notificationId: number): Promise<AdminNotificationSummary | null>;
  update(
    input: UpdateAdminNotificationInput
  ): Promise<UpdateAdminNotificationResult>;
  deleteDraft(notificationId: number): Promise<DeleteAdminNotificationResult>;
}
