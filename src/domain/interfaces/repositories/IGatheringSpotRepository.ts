import {
  GatheringSpotEntity,
  UpdateGatheringSpotInput,
} from '../../entities/GatheringSpot';

export interface IGatheringSpotRepository {
  exists: (gatheringSpotId: number) => Promise<boolean>;
  findAll: () => Promise<GatheringSpotEntity[]>;
  findById: (gatheringSpotId: number) => Promise<GatheringSpotEntity | null>;
  create: (gatheringSpotName: string) => Promise<GatheringSpotEntity>;
  update: (
    gatheringSpotId: number,
    input: UpdateGatheringSpotInput
  ) => Promise<GatheringSpotEntity | null>;
  delete: (gatheringSpotId: number) => Promise<boolean>;
  hasGatherings: (gatheringSpotId: number) => Promise<boolean>;
}
