import { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';
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
    ): Promise<GatheringGroupMemberEntity[]> {
      await ensureGatheringGroupExists(gatheringGroupId);
      return gatheringGroupMemberRepository.findByGatheringGroupId(
        gatheringGroupId
      );
    },

    async addGatheringGroupMember(
      gatheringGroupId: number,
      userId: number
    ): Promise<GatheringGroupMemberEntity> {
      await ensureGatheringGroupExists(gatheringGroupId);
      await ensureUserExists(userId);
      return gatheringGroupMemberRepository.create(gatheringGroupId, userId);
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
