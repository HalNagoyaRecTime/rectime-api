export interface IAccountDeletionService {
  // アカウント削除(#265 PR4)。関連データの削除・匿名化を行う。
  // - Microsoft連携(microsoft_account_links)・AUTH_KVのRefresh Session・
  //   Firebase Token無効化はPR1/PR3(authService.startAccountDeletion)が
  //   既に担当済みのため、ここでは扱わない。
  // - ロール(staffs/teachers)、所属(gathering_group_members)、
  //   通知関連データ(notification_schedules、firebase_tokens本体)を処理する。
  // - 各ステップは対象が既に存在しなければ何もしない冪等な実装のため、
  //   D1・KV・Firebaseの途中で失敗しても、同じuserIdで安全に再実行できる。
  deleteRelatedData(userId: string): Promise<void>;
}
