import type { EventGatheringChangeSet } from '../../entities/EventGathering';
import type { GatheringNotificationCleanupPlan } from '../../entities/GatheringNotificationCleanup';

export interface GatheringNotificationChanges {
  holdNotificationSyncGatheringIds?: number[];
  notificationCleanup?: GatheringNotificationCleanupPlan;
}

// 集合予定の変更と、それに伴う通知の保留・削除・停止を原子的に保存する契約。
// いずれかが失敗した場合は全体を取り消す。
export interface IGatheringSettingsTransaction {
  apply(
    changeSet: EventGatheringChangeSet,
    notifications?: GatheringNotificationChanges
  ): Promise<void>;
}
