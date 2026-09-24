import {
  FirebaseTokenEntity,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../entities/FirebaseToken';

export interface IFirebaseTokenRepository {
  register: (
    input: RegisterFirebaseTokenInput
  ) => Promise<RegisterFirebaseTokenResult>;
  findActiveTokens: () => Promise<FirebaseTokenEntity[]>;
  deactivate: (firebaseTokenId: number) => Promise<void>;
  // アカウント削除時、対象ユーザーのFirebase Token登録をPush通知対象から
  // 除外する。notification_schedulesはfirebase_tokensとJOINして
  // is_firebase_activeを参照するため、これを落とすだけで
  // 以後の配信対象から外れる(該当のfirebase_token_id自体を保持したまま
  // 無効化する)。
  deactivateByUserId: (userId: number) => Promise<void>;
  // アカウント削除(#265 PR4)専用。user_idに紐づくfirebase_tokens行を
  // 探す。notification_schedules.deleteByFirebaseTokenIdを呼ぶ前に
  // firebase_token_idを特定するために使う。
  findByUserId: (userId: number) => Promise<FirebaseTokenEntity | null>;
  // アカウント削除時に複数端末分の通知スケジュールを処理するために使う。
  findAllByUserId: (userId: number) => Promise<FirebaseTokenEntity[]>;
  // 指定利用者が所有するTokenだけを物理削除し、結果を区別する。
  deleteOwnedById: (
    firebaseTokenId: number,
    userId: number
  ) => Promise<'deleted' | 'forbidden' | 'not_found'>;
  // アカウント削除(#265 PR4)専用。fcm_token(端末識別子)は個人情報に
  // 近いため、無効化(deactivateByUserId)だけでなく行自体を物理削除する。
  // Legacy AccountDeletionの現在の個人データ削除方針を維持するため、呼び出し元は
  // 先にdeleteByFirebaseTokenIdで該当するnotification_schedules行を削除する。
  // FK制約上の必須順序ではない。対象が無ければ何もしない(冪等)。
  //
  // register()の所有者変更では旧Token行を物理削除し、参照DeliveryはFKでNULL化する。
  // ここで行を物理削除するのも、外部キー制約上の都合ではなく意図的な判断。
  // 本人からの削除要求に対しては、送信実績の集計・監査よりも個人データの
  // 消去を優先する方針を#263の起票者に確認済み(AccountDeletionService.
  // deleteRelatedData参照)。
  deleteByUserId: (userId: number) => Promise<void>;
}
