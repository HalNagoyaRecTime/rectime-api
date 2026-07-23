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
  findGatheringGroupId: (gatheringId: number) => Promise<number | null>;
  hasNotificationSchedules: (gatheringGroupId: number) => Promise<boolean>;
  remove: (gatheringId: number) => Promise<boolean>;
}
