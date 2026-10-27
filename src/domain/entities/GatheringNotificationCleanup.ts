import type {
  NotificationPushDeliveryStatus,
  NotificationScheduleStatus,
  NotificationSourceType,
  NotificationType,
} from './Notification';
import type { NotificationStopPolicy } from './NotificationStop';

export interface GatheringNotificationCleanupPolicy {
  schedule: {
    stopped_status: Extract<NotificationScheduleStatus, 'stopped'>;
    delete_statuses: NotificationScheduleStatus[];
    delete_only_unstarted: boolean;
  };
  delivery: {
    stop_statuses: NotificationPushDeliveryStatus[];
    stopped_status: Extract<NotificationPushDeliveryStatus, 'stopped'>;
  };
  notification: {
    source_type: Extract<NotificationSourceType, 'gathering'>;
    notification_type: Extract<NotificationType, 'notification_general'>;
  };
}

// Gathering削除時に自動通知を削除・停止する条件。
// Repositoryはこのpolicyだけを参照し、状態ごとの判定を保持しない。
export const GATHERING_NOTIFICATION_CLEANUP_POLICY: GatheringNotificationCleanupPolicy =
  {
    schedule: {
      stopped_status: 'stopped',
      delete_statuses: ['scheduled'],
      delete_only_unstarted: true,
    },
    delivery: {
      stop_statuses: ['pending', 'retry_wait'],
      stopped_status: 'stopped',
    },
    notification: {
      source_type: 'gathering',
      notification_type: 'notification_general',
    },
  };

// Gathering削除と同一batchで適用する自動通知cleanupの入力。
// 実際の削除・停止はRepositoryが担い、Gathering削除の成否と原子的に確定する。
export interface GatheringNotificationCleanupPlan {
  gathering_ids: number[];
  stop_policy: NotificationStopPolicy;
  cleanup_policy: GatheringNotificationCleanupPolicy;
}
