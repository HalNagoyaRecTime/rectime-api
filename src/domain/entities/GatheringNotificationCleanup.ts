import type { NotificationStopPolicy } from './NotificationStop';

// Gathering削除と同一batchで適用する自動通知cleanupの入力。
// 実際の削除・停止はRepositoryが担い、Gathering削除の成否と原子的に確定する。
export interface GatheringNotificationCleanupPlan {
  gathering_ids: number[];
  stop_policy: NotificationStopPolicy;
}
