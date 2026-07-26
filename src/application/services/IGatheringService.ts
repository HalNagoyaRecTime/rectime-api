import type {
  CreateGatheringRequestDTO,
  GatheringDTO,
} from '../dto/GatheringDTO';

export interface IGatheringService {
  getAllGatherings: () => Promise<GatheringDTO[]>;
  createGathering: (input: CreateGatheringRequestDTO) => Promise<GatheringDTO>;
  deleteGathering: (gatheringId: number) => Promise<void>;
}
