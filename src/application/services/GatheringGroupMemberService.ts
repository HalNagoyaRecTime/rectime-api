import type {
  AddGatheringGroupMemberRequestDTO,
  GatheringGroupMemberDTO,
} from '../dto/GatheringGroupMemberDTO';
import type { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';
import { IGatheringGroupMemberRepository } from '../../domain/interfaces/repositories/IGatheringGroupMemberRepository';
import { IGatheringGroupMemberService } from './IGatheringGroupMemberService';

export function createGatheringGroupMemberService(
  gatheringGroupMemberRepository: IGatheringGroupMemberRepository
): IGatheringGroupMemberService {
  async function ensureGatheringGroupExists(gatheringGroupId: number) {
    if (
      !(await gatheringGroupMemberRepository.existsGatheringGroup(
        gatheringGroupId
      ))
    ) {
      throw new Error('Gathering group not found');
    }
  }

  async function ensureUserExists(userId: number) {
    if (!(await gatheringGroupMemberRepository.existsUser(userId))) {
      throw new Error('User not found');
    }
  }

  return {
    async getGatheringGroupMembers(
      gatheringGroupId: number
    ): Promise<GatheringGroupMemberDTO[]> {
      await ensureGatheringGroupExists(gatheringGroupId);
      return (
        await gatheringGroupMemberRepository.findByGatheringGroupId(
          gatheringGroupId
        )
      ).map(toDTO);
    },

    async addGatheringGroupMember(
      gatheringGroupId: number,
      input: AddGatheringGroupMemberRequestDTO
    ): Promise<GatheringGroupMemberDTO> {
      await ensureGatheringGroupExists(gatheringGroupId);
      await ensureUserExists(input.userId);
      return toDTO(
        await gatheringGroupMemberRepository.create(
          gatheringGroupId,
          input.userId
        )
      );
    },

    async removeGatheringGroupMember(
      gatheringGroupId: number,
      userId: number
    ): Promise<boolean> {
      await ensureGatheringGroupExists(gatheringGroupId);
      await ensureUserExists(userId);
      const removed = await gatheringGroupMemberRepository.remove(
        gatheringGroupId,
        userId
      );
      if (!removed) throw new Error('Gathering group member not found');
      return true;
    },
  };
}

function toDTO(member: GatheringGroupMemberEntity): GatheringGroupMemberDTO {
  return { ...member };
}
