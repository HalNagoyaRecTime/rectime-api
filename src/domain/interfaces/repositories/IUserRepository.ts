import type { AppUser, UserCategories } from '../../auth/types';

export type UserDeletionStatus = 'active' | 'deletion_pending' | 'deleted';

export interface IUserRepository {
  exists(userId: number): Promise<boolean>;
  isStaff(userId: number): Promise<boolean>;
  getUserCategories(userId: number): Promise<UserCategories>;
  findUserIdByMicrosoftAccount(
    oid: string,
    tid: string
  ): Promise<string | null>;
  getDeletionStatus(userId: string): Promise<UserDeletionStatus | null>;
  createUserWithMicrosoftLink(params: {
    oid: string;
    tid: string;
    sub: string;
    email: string;
    displayName: string;
  }): Promise<AppUser>;
  updateUser(params: {
    userId: string;
    oid: string;
    tid: string;
    sub: string;
    email: string;
    displayName: string;
  }): Promise<AppUser | null>;
  linkMicrosoftAccount(params: {
    userId: string;
    oid: string;
    tid: string;
  }): Promise<void>;
  // deletion_statusを'deleted'にし、同時にmicrosoft_account_linksを削除する。
  // links を残したままだと、同一Microsoftアカウントでの再ログインが
  // findUserIdByMicrosoftAccount経由で古いdeletedユーザーを見つけてしまい、
  // 新規アカウントとしての再登録(#265で確定した方針)が成立しなくなる。
  // D1・KV・Firebaseにまたがる削除処理全体(#265 PR4)はこのメソッドの
  // 呼び出し元でオーケストレーションする想定で、ここではuser_idに対する
  // 最小限の状態遷移のみを担う。
  //
  // 呼び出し完了時点では、関連データの削除・匿名化(後片付け)はまだ
  // 完了していない(purged_atはNULLのまま)。後片付けは複数テーブルへの
  // 個別の書き込みで構成され単一トランザクションにできないため、
  // 「削除を受け付けた」(このメソッド)と「後片付けまで完了した」
  // (markAsPurged)を別ステップに分けている。
  markAsDeleted(userId: string): Promise<boolean>;
  // AccountDeletionService.deleteRelatedDataが関連データの削除・匿名化を
  // 全て完了した後に呼ぶ。purged_atに完了時刻をセットする(#265 PR4)。
  // `WHERE deletion_status = 'deleted' AND purged_at IS NULL`で、
  // markAsDeletedは完了したが後片付けが途中で失敗した利用者を後から
  // 機械的に抽出・再実行できるようにするための最終ステップ。
  //
  // deletion_status = 'deleted'であることをWHERE句自体に含める(userIdのみ
  // で更新しない)。抽出条件・isPurgedの判定条件と同じ2軸(状態+完了時刻)を
  // 使うことで契約を揃えておく。揃えないと、将来「削除の取り消し」で
  // deletion_statusを'active'等へ戻す機能が入った際、purged_atだけが
  // 残った利用者が生まれ得る。
  markAsPurged(userId: string): Promise<boolean>;
  // 後片付け(関連データの削除・匿名化)が完了しているかを判定する。
  // deletion_status = 'deleted' かつ purged_at IS NOT NULL の場合のみtrue。
  // 上のmarkAsPurgedと同じ2軸で判定することで、契約(この2条件を満たす
  // 場合のみtrue)と実装を一致させる。
  isPurged(userId: string): Promise<boolean>;
  // アカウント削除(#265 PR4)専用。users.user_nameを固定文字列に書き換える。
  // ロール(staffs/teachers)や所属を削除するだけではusers行の表示名は
  // 残ったままになるため、ロールの種類によらず常にこのメソッドで
  // user_nameを匿名化する必要がある(呼び出し元:
  // AccountDeletionService.deleteRelatedData)。該当するuserIdが
  // 存在しない場合は何もせずfalseを返す(冪等)。
  anonymizeUser(userId: string): Promise<boolean>;
}
