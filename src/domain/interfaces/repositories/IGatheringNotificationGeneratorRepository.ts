export interface IGatheringNotificationGeneratorRepository {
  findGatheringTime(gatheringId: number): Promise<string | null>;
}
