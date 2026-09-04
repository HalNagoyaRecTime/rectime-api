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
  // アカウント削除(#265 PR4)専用。fcm_token(端末識別子)は個人情報に
  // 近いため、無効化(deactivateByUserId)だけでなく行自体を物理削除する。
  // notification_schedules.firebase_token_idがNOT NULL外部キーで参照して
  // いるため、呼び出し元は必ず先にdeleteByFirebaseTokenIdで該当する
  // notification_schedules行を削除しておく必要がある。対象が無ければ
  // 何もしない(冪等)。
  deleteByUserId: (userId: number) => Promise<void>;
}
