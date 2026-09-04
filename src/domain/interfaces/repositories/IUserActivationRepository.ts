// 認証済みリクエストが「今この瞬間もアクセスを許されているユーザーか」を
// 判定するためだけのインターフェース。IUserRepositoryに追加しないのは、
// あちらが6つのサービスから使われていてモックが各テストに散在しており、
// 認証ゲート専用の判定を足すと無関係なテストまで差分が及ぶため。
export interface IUserActivationRepository {
  // users.is_live_active が 1 のときだけ true。該当ユーザーが存在しない
  // 場合も false を返す（判定できない場合は通さない＝フェイルクローズ）。
  isActive(userId: number): Promise<boolean>;
}
