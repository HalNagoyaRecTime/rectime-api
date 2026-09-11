import { GatheringGroupMemberEntity } from '../../entities/GatheringGroupMember';
import { GatheringMemberSummary } from '../../entities/GatheringMemberSummary';

export interface IGatheringGroupMemberRepository {
  existsGathering: (gatheringId: number) => Promise<boolean>;
  existsUser: (userId: number) => Promise<boolean>;
  findByGatheringId: (
    gatheringId: number
  ) => Promise<GatheringGroupMemberEntity[]>;
  // GET /gatherings/:gatheringId/members 用。usersとJOINしてdisplay_nameを含めて返す。
  findMemberSummariesByGatheringId: (
    gatheringId: number
  ) => Promise<GatheringMemberSummary[]>;
  create: (
    gatheringId: number,
    userId: number
  ) => Promise<GatheringGroupMemberEntity>;
  remove: (gatheringId: number, userId: number) => Promise<boolean>;
  // 指定されたuserIdsのうち実在しないものを返す。PUTでの一括置換前の検証に使う。
  findMissingUserIds: (userIds: number[]) => Promise<number[]>;
  // 現在の参加者集合をuserIdsへ一括置換する。差分反映は原子的に行われ、
  // 途中状態(一部だけ反映された状態)は残らない。
  replaceMembers: (
    gatheringId: number,
    userIds: number[]
  ) => Promise<GatheringMemberSummary[]>;
  // アカウント削除(#265 PR4)専用。該当ユーザーが所属する全gatheringの
  // メンバー行を削除する。対象が無ければ何もしない(冪等)。
  deleteByUserId: (userId: number) => Promise<void>;
}
