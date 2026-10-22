import type { INotificationStopService } from './INotificationStopService';
import type { IGatheringNotificationCleanupService } from './IGatheringNotificationCleanupService';

export function createGatheringNotificationCleanupService(
  notificationStopService: Pick<INotificationStopService, 'createStopPolicy'>
): IGatheringNotificationCleanupService {
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
        // 処理中ScheduleのStop条件は共通Stop Serviceのpolicyに合わせる。
        stop_policy: notificationStopService.createStopPolicy(
          { reason: 'source_deleted' },
          now
        ),
      };
    },
  };
}
