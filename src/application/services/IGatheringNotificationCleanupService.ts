import type { GatheringNotificationCleanupPlan } from '../../domain/entities/GatheringNotificationCleanup';

export interface IGatheringNotificationCleanupService {
  // 削除対象のGathering IDから、Repositoryへ渡すcleanup planを作る。
  // 対象が無い場合はnullを返し、Gathering設定のbatchへ不要な条件を追加しない。
  prepareCleanup: (
    gatheringIds: number[],
    now?: Date
  ) => GatheringNotificationCleanupPlan | null;
}
