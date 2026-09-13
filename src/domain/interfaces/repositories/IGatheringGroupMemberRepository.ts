import { GatheringGroupMemberEntity } from '../../entities/GatheringGroupMember';

export interface IGatheringGroupMemberRepository {
  existsGathering: (gatheringId: number) => Promise<boolean>;
  existsUser: (userId: number) => Promise<boolean>;
  findByGatheringId: (
    gatheringId: number
  ) => Promise<GatheringGroupMemberEntity[]>;
  create: (
    gatheringId: number,
    userId: number
  ) => Promise<GatheringGroupMemberEntity>;
  remove: (gatheringId: number, userId: number) => Promise<boolean>;
  // 指定されたuserIdsのうち実在しないものを返す。PUTでの一括置換前の検証に使う。
  findMissingUserIds: (userIds: number[]) => Promise<number[]>;
  // 差分(addUserIds/removeUserIds)だけをgatheringId配下へ反映する。
  // 変更のないメンバーの行(gathering_group_member_id・created_at含む)には触れない。
  // 削除と追加は同一batch内で原子的に行われ、途中状態は残らない。
  applyMemberDiff: (
    gatheringId: number,
    addUserIds: number[],
    removeUserIds: number[]
  ) => Promise<GatheringGroupMemberEntity[]>;
  // アカウント削除(#265 PR4)専用。該当ユーザーが所属する全gatheringの
  // メンバー行を削除する。対象が無ければ何もしない(冪等)。
  deleteByUserId: (userId: number) => Promise<void>;
}
