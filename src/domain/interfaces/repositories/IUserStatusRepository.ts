import type { UserStatusEntity } from '../../entities/User';

// users.is_live_active の更新だけを担う。認証・Microsoft連携を扱う
// IUserRepository とは責務が異なるため、インターフェースを分けている。
export interface IUserStatusRepository {
  // 対象Userが存在しない場合は null を返す
  updateLiveActive(
    userId: number,
    isLiveActive: boolean
  ): Promise<UserStatusEntity | null>;

  // 指定User以外に、有効な管理権限保持者(staff)が存在するか。
  // 管理権限を持つUserが0人になる無効化を防ぐために使う。
  hasOtherActiveStaff(excludedUserId: number): Promise<boolean>;
}
