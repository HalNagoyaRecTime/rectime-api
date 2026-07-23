import {
  CreateGatheringInput,
  GatheringDetailsEntity,
} from '../../domain/entities/Gathering';

export interface IGatheringService {
  getAllGatherings: () => Promise<GatheringDetailsEntity[]>;
  getGatheringByEventId: (
    eventId: number
  ) => Promise<GatheringDetailsEntity | null>;
  createGathering: (
    input: CreateGatheringInput
  ) => Promise<GatheringDetailsEntity>;
}
