import {
  GatheringSpotEntity,
  GatheringSpotListOptions,
  GatheringSpotPage,
  UpdateGatheringSpotInput,
} from '../../domain/entities/GatheringSpot';

export interface IGatheringSpotService {
  getAllGatheringSpots: () => Promise<GatheringSpotEntity[]>;
  getGatheringSpotPage: (
    options: GatheringSpotListOptions
  ) => Promise<GatheringSpotPage>;
  getGatheringSpotById: (
    gatheringSpotId: number
  ) => Promise<GatheringSpotEntity>;
  createGatheringSpot: (
    gatheringSpotName: string
  ) => Promise<GatheringSpotEntity>;
  updateGatheringSpot: (
    gatheringSpotId: number,
    input: UpdateGatheringSpotInput
  ) => Promise<GatheringSpotEntity>;
  deleteGatheringSpot: (gatheringSpotId: number) => Promise<void>;
}
