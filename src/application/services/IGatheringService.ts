import type { GatheringDetailsEntity } from '../../domain/entities/Gathering';

export interface IGatheringService {
  getGatheringsByEventId: (
    eventId: number
  ) => Promise<GatheringDetailsEntity[]>;
}
