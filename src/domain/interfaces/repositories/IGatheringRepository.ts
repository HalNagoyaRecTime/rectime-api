import {
  CreateGatheringInput,
  GatheringDetailsEntity,
} from '../../entities/Gathering';

export interface IGatheringRepository {
  findAll: () => Promise<GatheringDetailsEntity[]>;
  existsGatheringGroup: (gatheringGroupId: number) => Promise<boolean>;
  existsEvent: (eventId: number) => Promise<boolean>;
  existsGatheringSpot: (gatheringSpotId: number) => Promise<boolean>;
  create: (input: CreateGatheringInput) => Promise<GatheringDetailsEntity>;
  findByEventAndGroup: (
    eventId: number,
    gatheringGroupId: number
  ) => Promise<GatheringDetailsEntity | null>;
}
