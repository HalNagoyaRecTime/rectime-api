import type { NotificationScheduleStatus } from '../../domain/entities/NotificationV3';
import type { IGatheringNotificationCleanupRepository } from '../../domain/interfaces/repositories/IGatheringNotificationCleanupRepository';
import type { INotificationStopService } from './INotificationStopService';
import type {
  GatheringNotificationCleanupResult,
  IGatheringNotificationCleanupService,
} from './IGatheringNotificationCleanupService';

const ACTIVE_SCHEDULE_STATUSES = new Set<NotificationScheduleStatus>([
  'resolving',
  'sending',
]);

const PRESERVED_SCHEDULE_STATUSES = new Set<NotificationScheduleStatus>([
  'completed',
  'failed',
  'stopped',
]);

export function createGatheringNotificationCleanupService(deps: {
  repository: IGatheringNotificationCleanupRepository;
  notificationStopService: INotificationStopService;
}): IGatheringNotificationCleanupService {
  const { repository, notificationStopService } = deps;

  return {
    async cleanupForGatherings(
      gatheringIds,
      now = new Date()
    ): Promise<GatheringNotificationCleanupResult> {
      if (gatheringIds.length === 0) {
        return {
          deletedScheduleCount: 0,
          stoppedScheduleCount: 0,
          preservedNotificationCount: 0,
        };
      }

      const schedules =
        await repository.findAutomaticSchedulesByGatheringIds(gatheringIds);
      const notificationIds = new Set(
        schedules.map(schedule => schedule.notificationId)
      );
      let deletedScheduleCount = 0;
      let stoppedScheduleCount = 0;

      for (const schedule of schedules) {
        const status = schedule.sendStatus as NotificationScheduleStatus;
        if (ACTIVE_SCHEDULE_STATUSES.has(status)) {
          const stopped = await notificationStopService.stopSchedule(
            {
              scheduleId: schedule.scheduleId,
              stoppedByUserId: null,
              reason: 'source_deleted',
            },
            now
          );
          if (stopped.status === 'stopped') stoppedScheduleCount += 1;
          continue;
        }
        if (
          schedule.startedAt !== null ||
          PRESERVED_SCHEDULE_STATUSES.has(status)
        ) {
          continue;
        }

        if (await repository.deleteUnstartedSchedule(schedule.scheduleId)) {
          deletedScheduleCount += 1;
          continue;
        }

        // Workerがこの間にscheduledからresolving/sendingへ進んだ場合は、同じ
        // 共通Stopへフォールバックする。Stop側のCASが最終的な競合判定になる。
        const stopped = await notificationStopService.stopSchedule(
          {
            scheduleId: schedule.scheduleId,
            stoppedByUserId: null,
            reason: 'source_deleted',
          },
          now
        );
        if (stopped.status === 'stopped') stoppedScheduleCount += 1;
      }

      let preservedNotificationCount = 0;
      for (const notificationId of notificationIds) {
        const deleted =
          await repository.deleteNotificationIfNoSchedules(notificationId);
        if (!deleted) preservedNotificationCount += 1;
      }

      return {
        deletedScheduleCount,
        stoppedScheduleCount,
        preservedNotificationCount,
      };
    },
  };
}
