export interface RetryPendingPurgesResult {
  targetCount: number;
  succeededCount: number;
  failedCount: number;
}

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

  // 途中失敗で後片付けが未完了(deletion_status='deleted' AND purged_at
  // IS NULL)のまま放置されている利用者を、userRepository.
  // findPendingPurgeUserIdsで抽出し、それぞれdeleteRelatedDataを
  // 再実行する(#345)。deleteRelatedData自体が冪等なため、対象1件ごとに
  // 独立して成功・失敗する。1件の失敗が他の対象の処理を止めないよう、
  // ループ内の例外は内部で捕捉し失敗件数としてカウントする。
  //
  // 呼び出し元(index.tsのscheduledハンドラ、ctx.waitUntil)には例外を
  // 一切送出しない契約。対象抽出自体(findPendingPurgeUserIds)が失敗した
  // 場合も同様にここで捕捉し、targetCount: 0, failedCount: 1として
  // 完了ログを必ず残す(Cron実行がunhandled rejectionとしてサイレントに
  // 落ちることを防ぐ)。
  //
  // 対象件数・成功件数・失敗件数のみを返し、個人情報やuserId自体は
  // 返り値にもretryPendingPurges自身のログにも含めない。ただし
  // deleteRelatedData内部の各段が既存の[ACCOUNT_DELETION] failedログで
  // userId(内部連番ID、個人情報ではない)を出力する点は変わらない。
  retryPendingPurges(limit: number): Promise<RetryPendingPurgesResult>;
}
