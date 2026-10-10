import {
  GatheringSpotListOptions,
  UpdateGatheringSpotInput,
} from '../../domain/entities/GatheringSpot';
import {
  GatheringSpotDTO,
  GatheringSpotPageDTO,
} from '../dto/GatheringSpotDTO';

export interface IGatheringSpotService {
  getAllGatheringSpots: () => Promise<GatheringSpotDTO[]>;
  getGatheringSpotPage: (
    options: GatheringSpotListOptions
  ) => Promise<GatheringSpotPageDTO>;
  createGatheringSpot: (gatheringSpotName: string) => Promise<GatheringSpotDTO>;
  updateGatheringSpot: (
    gatheringSpotId: number,
    input: UpdateGatheringSpotInput
  ) => Promise<GatheringSpotDTO>;
  deleteGatheringSpot: (gatheringSpotId: number) => Promise<void>;
}
