export interface IGatheringNotificationGeneratorRepository {
  findGatheringTime(gatheringId: number): Promise<string | null>;
  findConfiguredGatheringIds(): Promise<number[]>;
  holdAutomaticSchedules(gatheringId: number): Promise<void>;
  clearAutomaticScheduleHold(
    gatheringId: number,
    expectedGatheringTime: string | null
  ): Promise<void>;
}
