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

  return {
    async getGatheringMembers(
      gatheringId: number
    ): Promise<GatheringGroupMemberEntity[]> {
      await ensureGatheringExists(gatheringId);
      return gatheringGroupMemberRepository.findByGatheringId(gatheringId);
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
      //
      // 既知の制約: 現在の参加者の読み取りと差分反映は別クエリのため、
      // 同一集合へのPUTが同時に来ると後勝ちにならず、和集合になりうる
      // (例: 現在[1]に対しPUT[1,2]とPUT[1,3]が同時に来ると[1,2,3]になり、
      // どちらのuser_idsとも一致しない)。同一内容の同時再送はINSERT側の
      // ON CONFLICT DO NOTHINGで500にならない。
      const currentMembers =
        await gatheringGroupMemberRepository.findByGatheringId(gatheringId);
      const currentUserIds = new Set(currentMembers.map(m => m.user_id));
      const targetUserIds = new Set(userIds);

      const addUserIds = userIds.filter(userId => !currentUserIds.has(userId));
      const removeUserIds = currentMembers
        .map(m => m.user_id)
        .filter(userId => !targetUserIds.has(userId));

      // 無変更の冪等な再送では、直前のfindByGatheringIdの結果と
      // applyMemberDiffが返す内容が一致するため、そのまま返して
      // 差分反映後の再取得(D1往復)を省略する。
      if (addUserIds.length === 0 && removeUserIds.length === 0) {
        return currentMembers;
      }

      try {
        return await gatheringGroupMemberRepository.applyMemberDiff(
          gatheringId,
          addUserIds,
          removeUserIds
        );
      } catch (error) {
        // 存在確認後に集合が削除される競合では、INSERTが外部キー制約で
        // 失敗する。現在の状態を確認し、500ではなく404へ変換する。
        await ensureGatheringExists(gatheringId);
        throw error;
      }
    },
  };
}
