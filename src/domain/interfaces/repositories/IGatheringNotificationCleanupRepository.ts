export interface GatheringNotificationScheduleRecord {
  notificationId: number;
  scheduleId: number;
  sendStatus: string;
  startedAt: string | null;
}

export interface IGatheringNotificationCleanupRepository {
  findAutomaticSchedulesByGatheringIds: (
    gatheringIds: number[]
  ) => Promise<GatheringNotificationScheduleRecord[]>;
  deleteUnstartedSchedule: (scheduleId: number) => Promise<boolean>;
  deleteNotificationIfNoSchedules: (notificationId: number) => Promise<boolean>;
}
