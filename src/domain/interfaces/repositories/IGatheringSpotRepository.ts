import {
  GatheringSpotEntity,
  UpdateGatheringSpotInput,
} from '../../entities/GatheringSpot';

export interface IGatheringSpotRepository {
  findAll: () => Promise<GatheringSpotEntity[]>;
  create: (gatheringSpotName: string) => Promise<GatheringSpotEntity>;
  update: (
    gatheringSpotId: number,
    input: UpdateGatheringSpotInput
  ) => Promise<GatheringSpotEntity | null>;
}
