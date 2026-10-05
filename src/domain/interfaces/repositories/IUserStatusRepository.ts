import type { UserStatusEntity } from '../../entities/UserStatus';

// users の稼働状態(is_live_active)と退会状態(deletion_status)を読み書きする。
// 認証・Microsoft連携・退会処理そのものを扱う IUserRepository とは責務が
// 異なるため、インターフェースを分けている。
//
// 「有効」という言葉が2つの軸を指すため、各メソッドがどちらを見るかを
// コメントで明示している。
export interface IUserStatusRepository {
  // 認証済みリクエストが「今この瞬間もアクセスを許されているか」の判定。
  // is_live_active が 1 で、かつ退会していない(deletion_status が 'active')
  // ときだけ true。該当ユーザーが存在しない場合も false を返す
  // (判定できない場合は通さない＝フェイルクローズ)。
  //
  // 退会状態も見るのは、bearerAuthentication が D1 障害時に退会確認を
  // 意図的に素通しする設計のため。ここで両方を見ておけば、その場合でも
  // 退会済みユーザーは遮断される。
  isActive(userId: number): Promise<boolean>;

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
