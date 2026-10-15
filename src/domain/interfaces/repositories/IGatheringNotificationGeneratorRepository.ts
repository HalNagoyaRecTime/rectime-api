export interface IGatheringNotificationGeneratorRepository {
  findGatheringTime(gatheringId: number): Promise<string | null>;
  findConfiguredGatheringIds(): Promise<number[]>;
  markSynchronizationFailed(gatheringId: number): Promise<void>;
  clearSynchronizationFailure(gatheringId: number): Promise<void>;
}
