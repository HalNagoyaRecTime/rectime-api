import {
  CreateGatheringInput,
  GatheringDetailsEntity,
} from '../../domain/entities/Gathering';

export interface IGatheringService {
  getAllGatherings: () => Promise<GatheringDetailsEntity[]>;
  createGathering: (
    input: CreateGatheringInput
  ) => Promise<GatheringDetailsEntity>;
}
