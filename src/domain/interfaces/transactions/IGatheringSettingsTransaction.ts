import type { EventGatheringChangeSet } from '../../entities/EventGathering';
import type { GatheringNotificationCleanupPlan } from '../../entities/GatheringNotificationCleanup';

export interface GatheringNotificationChanges {
  holdNotificationSyncGatheringIds?: number[];
  notificationCleanup?: GatheringNotificationCleanupPlan;
}

export interface GatheringSettingsOptions {
  // 取得時点のEventの lock_version。指定された場合だけ、Eventの版が一致するときに限って
  // 保存する。
  expectedLockVersion?: number;
}

// 集合予定の変更と、それに伴う通知の保留・削除・停止を原子的に保存する契約。
// いずれかが失敗した場合は全体を取り消す。
//
// 変更があれば、対象Eventの lock_version も進める。変更が無い場合は何も書かず、
// 版も進めない。
// expectedLockVersion を指定した場合は、Eventの版が一致しなければ何も書かずに
// false を返す（Eventが存在しない場合も false）。それ以外は true を返す。
export interface IGatheringSettingsTransaction {
  apply(
    changeSet: EventGatheringChangeSet,
    notifications?: GatheringNotificationChanges,
    options?: GatheringSettingsOptions
  ): Promise<boolean>;
}
