export interface IAccountDeletionService {
  // アカウント削除(#265 PR4)。関連データの削除・匿名化を行う。
  // - Microsoft連携(microsoft_account_links)・AUTH_KVのRefresh Session・
  //   Firebase Token無効化はPR1/PR3(authService.startAccountDeletion)が
  //   既に担当済みのため、ここでは扱わない。
  // - ロール(staffs/teachers)、所属(gathering_group_members)、
  //   通知関連データ(notification_schedules、firebase_tokens本体)を処理する。
  // - 各ステップは対象が既に存在しなければ何もしない冪等な実装のため、
  //   D1・KV・Firebaseの途中で失敗しても、同じuserIdで安全に再実行できる。
  // - 「削除を受け付けた」(deletion_status='deleted')と「後片付けまで
  //   完了した」(purged_at IS NOT NULL)を別に管理する。全ステップが成功
  //   した時だけpurged_atをセットするため、途中で失敗した利用者は
  //   purged_atがNULLのまま残り、`WHERE deletion_status = 'deleted' AND
  //   purged_at IS NULL`で機械的に抽出して同じuserIdで再実行できる
  //   (単一トランザクションにできない処理の安全網)。
  //
  // 呼び出し順序の前提(重要): 安全性は、呼び出し元が
  // authService.startAccountDeletion(userId)でdeletion_statusを
  // 'deleted'にし、Microsoftアカウントとの紐付けを断ち切った"後"に
  // このメソッドを呼ぶ、という順序に依存している。bearerAuthentication
  // Middlewareはdeletion_status !== 'active'のユーザーからのリクエストを
  // 全経路で拒否するため、この順序を守る限り、対象ユーザー自身による
  // firebase_tokens再登録やstudents更新などとの競合は起こらない。
  // この前提はコメントだけに頼らず、実装内でdeletion_status === 'deleted'
  // を自己確認して強制している(満たさない場合は例外を投げる)。
  deleteRelatedData(userId: string): Promise<void>;
}
