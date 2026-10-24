import { GATHERING_NOTIFICATION_CLEANUP_POLICY } from '../../domain/entities/GatheringNotificationCleanup';
import { buildNotificationStopPolicy } from '../../domain/entities/notificationStopPolicy';
import type { IGatheringNotificationCleanupService } from './IGatheringNotificationCleanupService';

export function createGatheringNotificationCleanupService(): IGatheringNotificationCleanupService {
  return {
    prepareCleanup(gatheringIds, now = new Date()) {
      const uniqueIds = Array.from(
        new Set(
          gatheringIds.filter(
            gatheringId => Number.isInteger(gatheringId) && gatheringId > 0
          )
        )
      );
      if (uniqueIds.length === 0) return null;

      return {
        gathering_ids: uniqueIds,
        // 処理中Scheduleの停止条件は手動停止と同じ共通ルールで構築する。
        stop_policy: buildNotificationStopPolicy(
          { reason: 'source_deleted' },
          now
        ),
        // 削除・停止の対象StatusはDomain policyで固定する。
        cleanup_policy: GATHERING_NOTIFICATION_CLEANUP_POLICY,
      };
    },
  };
}
