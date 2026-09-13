import type { GatheringDetailsEntity } from '../../domain/entities/Gathering';

export interface IGatheringService {
  getAllGatherings: () => Promise<GatheringDetailsEntity[]>;
  getGatheringsByEventId: (
    eventId: number
  ) => Promise<GatheringDetailsEntity[]>;
}
