import { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';
import { IGatheringGroupMemberRepository } from '../../domain/interfaces/repositories/IGatheringGroupMemberRepository';
import { IGatheringGroupMemberService } from './IGatheringGroupMemberService';

export function createGatheringGroupMemberService(
  gatheringGroupMemberRepository: IGatheringGroupMemberRepository
): IGatheringGroupMemberService {
  async function ensureGatheringExists(gatheringId: number) {
    if (!(await gatheringGroupMemberRepository.existsGathering(gatheringId))) {
      throw new Error('Gathering not found');
    }
  }

  async function ensureUserExists(userId: number) {
    if (!(await gatheringGroupMemberRepository.existsUser(userId))) {
      throw new Error('User not found');
    }
  }

  return {
    async getGatheringMembers(
      gatheringId: number
    ): Promise<GatheringGroupMemberEntity[]> {
      await ensureGatheringExists(gatheringId);
      return gatheringGroupMemberRepository.findByGatheringId(gatheringId);
    },

    async addGatheringMember(
      gatheringId: number,
      userId: number
    ): Promise<GatheringGroupMemberEntity> {
      await ensureGatheringExists(gatheringId);
      await ensureUserExists(userId);
      try {
        return await gatheringGroupMemberRepository.create(gatheringId, userId);
      } catch (error) {
        // 存在確認後に集合または利用者が削除される競合では、INSERTが
        // 外部キー制約で失敗する。現在の状態を確認し、500ではなく404へ変換する。
        const [gatheringExists, userExists] = await Promise.all([
          gatheringGroupMemberRepository.existsGathering(gatheringId),
          gatheringGroupMemberRepository.existsUser(userId),
        ]);
        if (!gatheringExists) throw new Error('Gathering not found');
        if (!userExists) throw new Error('User not found');
        throw error;
      }
    },

    async removeGatheringMember(
      gatheringId: number,
      userId: number
    ): Promise<boolean> {
      const removed = await gatheringGroupMemberRepository.remove(
        gatheringId,
        userId
      );
      if (!removed) throw new Error('Gathering member not found');
      return true;
    },

    async replaceGatheringMembers(
      gatheringId: number,
      userIds: number[]
    ): Promise<GatheringGroupMemberEntity[]> {
      await ensureGatheringExists(gatheringId);

      if (userIds.length > 0) {
        const missingUserIds =
          await gatheringGroupMemberRepository.findMissingUserIds(userIds);
        if (missingUserIds.length > 0) {
          throw new Error('User not found');
        }
      }

      // 変更のないメンバーの行(gathering_group_member_id・created_at)を
      // 保持するため、全削除→全挿入ではなく現在の参加者集合との差分だけを
      // Repositoryへ反映する。同一内容の再送はPUTを非冪等にしない。
      const currentMembers =
        await gatheringGroupMemberRepository.findByGatheringId(gatheringId);
      const currentUserIds = new Set(currentMembers.map(m => m.user_id));
      const targetUserIds = new Set(userIds);

      const addUserIds = userIds.filter(userId => !currentUserIds.has(userId));
      const removeUserIds = currentMembers
        .map(m => m.user_id)
        .filter(userId => !targetUserIds.has(userId));

      return gatheringGroupMemberRepository.applyMemberDiff(
        gatheringId,
        addUserIds,
        removeUserIds
      );
    },
  };
}
