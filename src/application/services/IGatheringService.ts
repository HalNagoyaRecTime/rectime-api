import {
  CreateGatheringInput,
  GatheringDetailsEntity,
} from '../../domain/entities/Gathering';

export interface IGatheringService {
  getAllGatherings: () => Promise<GatheringDetailsEntity[]>;
  getGatheringsByEventId: (
    eventId: number
  ) => Promise<GatheringDetailsEntity[]>;
  createGathering: (
    input: CreateGatheringInput
  ) => Promise<GatheringDetailsEntity>;
  deleteGathering: (gatheringId: number) => Promise<void>;
}
