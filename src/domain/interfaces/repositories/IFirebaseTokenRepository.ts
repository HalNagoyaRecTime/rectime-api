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
}
