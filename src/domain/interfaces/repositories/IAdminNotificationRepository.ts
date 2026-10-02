import type {
  ManualNotificationAudience,
  ManualNotificationAudienceStatus,
} from '../../entities/AdminNotification';

export interface IAdminNotificationRepository {
  getAudienceStatus(
    audience: ManualNotificationAudience
  ): Promise<ManualNotificationAudienceStatus>;
}
