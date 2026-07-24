import type {
  CreateGatheringRequestDTO,
  GatheringDTO,
} from '../dto/GatheringDTO';
import type { GatheringDetailsEntity } from '../../domain/entities/Gathering';
import { IGatheringRepository } from '../../domain/interfaces/repositories/IGatheringRepository';
import { IGatheringService } from './IGatheringService';

export function createGatheringService(
  gatheringRepository: IGatheringRepository
): IGatheringService {
  return {
    async getAllGatherings(): Promise<GatheringDTO[]> {
      return (await gatheringRepository.findAll()).map(toDTO);
    },

    async createGathering(
      input: CreateGatheringRequestDTO
    ): Promise<GatheringDTO> {
      if (
        !(await gatheringRepository.existsGatheringGroup(
          input.gatheringGroupId
        ))
      ) {
        throw new Error('Gathering group not found');
      }
      if (!(await gatheringRepository.existsEvent(input.eventId))) {
        throw new Error('Event not found');
      }
      if (
        !(await gatheringRepository.existsGatheringSpot(input.gatheringSpotId))
      ) {
        throw new Error('Gathering spot not found');
      }
      return toDTO(
        await gatheringRepository.create({
          gathering_group_id: input.gatheringGroupId,
          event_id: input.eventId,
          gathering_spot_id: input.gatheringSpotId,
          gathering_time: input.gatheringTime,
          round: input.round,
        })
      );
    },

    async deleteGathering(gatheringId: number): Promise<void> {
      if (!(await gatheringRepository.remove(gatheringId))) {
        throw new Error('Gathering not found');
      }
    },
  };
}

function toDTO(gathering: GatheringDetailsEntity): GatheringDTO {
  return { ...gathering };
}
