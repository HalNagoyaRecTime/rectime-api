import {
  CreateGatheringInput,
  GatheringDetailsEntity,
} from '../../entities/Gathering';

export interface IGatheringRepository {
  findByEventId: (eventId: number) => Promise<GatheringDetailsEntity[]>;

  existsEvent: (eventId: number) => Promise<boolean>;

  existsGatheringSpot: (gatheringSpotId: number) => Promise<boolean>;

  create: (input: CreateGatheringInput) => Promise<GatheringDetailsEntity>;

  remove: (gatheringId: number) => Promise<boolean>;
}
