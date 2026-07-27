import {
  GatheringSpotEntity,
  UpdateGatheringSpotInput,
} from '../../domain/entities/GatheringSpot';

export interface IGatheringSpotService {
  getAllGatheringSpots: () => Promise<GatheringSpotEntity[]>;
  createGatheringSpot: (
    gatheringSpotName: string
  ) => Promise<GatheringSpotEntity>;
  updateGatheringSpot: (
    gatheringSpotId: number,
    input: UpdateGatheringSpotInput
  ) => Promise<GatheringSpotEntity>;
}
