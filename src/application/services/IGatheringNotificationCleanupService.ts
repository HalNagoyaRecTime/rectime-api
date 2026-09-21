export interface GatheringNotificationCleanupResult {
  deletedScheduleCount: number;
  stoppedScheduleCount: number;
  preservedNotificationCount: number;
}

export interface IGatheringNotificationCleanupService {
  cleanupForGatherings: (
    gatheringIds: number[],
    now?: Date
  ) => Promise<GatheringNotificationCleanupResult>;
}
