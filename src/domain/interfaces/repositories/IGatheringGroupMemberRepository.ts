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
  // アカウント削除(#265 PR4)専用。該当ユーザーが所属する全gatheringの
  // メンバー行を削除する。対象が無ければ何もしない(冪等)。
  deleteByUserId: (userId: number) => Promise<void>;
}
