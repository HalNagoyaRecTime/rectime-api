import type {
  AdminNotificationCreationResult,
  CreateAdminNotificationInput,
  ManualNotificationAudience,
  ManualNotificationAudienceStatus,
} from '../../entities/AdminNotification';

export interface IAdminNotificationRepository {
  getAudienceStatus(
    audience: ManualNotificationAudience
  ): Promise<ManualNotificationAudienceStatus>;
  create(
    input: CreateAdminNotificationInput
  ): Promise<AdminNotificationCreationResult>;
}
