import {
  FirebaseTokenEntity,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../entities/FirebaseToken';

export interface IFirebaseTokenRepository {
  register: (
    input: RegisterFirebaseTokenInput
  ) => Promise<RegisterFirebaseTokenResult>;
  // FCMがUNREGISTEREDを返したTokenは内部処理で物理削除する。
  deleteById: (firebaseTokenId: number) => Promise<void>;
  // アカウント削除時に複数端末分のTokenを処理するために使う。
  findAllByUserId: (userId: number) => Promise<FirebaseTokenEntity[]>;
  // 認証Userが所有するFCM Tokenだけをlogout用に物理削除する。
  deleteByUserIdAndFcmToken: (
    userId: number,
    fcmToken: string
  ) => Promise<void>;
  // アカウント削除時、対象ユーザーのToken rowを物理削除する。
  // v2 Delivery履歴は保持し、FKのON DELETE SET NULLでToken参照だけを外す。
  // register()の所有者変更も旧rowを削除して新rowを作るため、過去Deliveryを
  // 新所有者のTokenへ付け替えない。対象が無ければ何もしない(冪等)。
  deleteByUserId: (userId: number) => Promise<void>;
}
