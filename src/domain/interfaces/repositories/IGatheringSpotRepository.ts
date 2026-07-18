import { GatheringSpotEntity } from '../../entities/GatheringSpot';

export interface IGatheringSpotRepository {
  findAll: () => Promise<GatheringSpotEntity[]>;
  create: (gatheringSpotName: string) => Promise<GatheringSpotEntity>;
}
