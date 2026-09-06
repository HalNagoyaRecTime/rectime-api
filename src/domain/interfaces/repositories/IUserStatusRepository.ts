import type { UserStatusEntity } from '../../entities/User';

// users.is_live_active の更新だけを担う。認証・Microsoft連携を扱う
// IUserRepository とは責務が異なるため、インターフェースを分けている。
export interface IUserStatusRepository {
  // 更新できた場合だけ結果を返す。以下のいずれかに当てはまると null になる。
  //   - 対象Userが存在しない
  //   - 対象Userが退会済み（deletion_status が 'active' でない）
  //   - 無効化しようとしたが、他に稼働中の管理権限保持者(staff)がいない
  //
  // 最後の1人を無効化させないための判定は、この更新と同じSQL文の中で行う。
  // 事前に別クエリで確認する形にすると、同時に2件の無効化が走ったときに
  // 双方が確認を通過して0人になりうるため。
  updateLiveActive(
    userId: number,
    isLiveActive: boolean
  ): Promise<UserStatusEntity | null>;

  // 更新できなかった理由を切り分けるために使う。退会していない対象が
  // 存在するなら、更新できなかった原因は「最後の管理権限保持者だった」。
  existsActiveUser(userId: number): Promise<boolean>;
}
