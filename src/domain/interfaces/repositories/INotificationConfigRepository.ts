import type { NotificationAudienceTarget } from '../../entities/AdminNotificationCommand';

export interface INotificationConfigRepository {
  areAudienceTargetsAvailable(
    targets: NotificationAudienceTarget[]
  ): Promise<boolean>;
  /** Audience間で重複排除した対象User数を返す */
  countAudienceUsers(targets: NotificationAudienceTarget[]): Promise<number>;
}
