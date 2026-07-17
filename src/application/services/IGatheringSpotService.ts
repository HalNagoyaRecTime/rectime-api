import { GatheringSpotEntity } from '../../domain/entities/GatheringSpot';

export interface IGatheringSpotService {
  getAllGatheringSpots: () => Promise<GatheringSpotEntity[]>;
  createGatheringSpot: (
    gatheringSpotName: string
  ) => Promise<GatheringSpotEntity>;
}
