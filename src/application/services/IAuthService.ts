import type { AppUser, MicrosoftClaims } from '../../domain/auth/types';

export type { MicrosoftClaims };

export interface IAuthService {
  upsertUser(claims: MicrosoftClaims): Promise<AppUser>;
  // アカウント削除の開始処理(#265 PR3スコープ)。deletion_statusを
  // 'deleted'にしてMicrosoftアカウントとの紐付けを断ち切ると同時に、
  // 発行済みの全Refresh Sessionを失効させ、Firebase Token登録を
  // Push通知対象から除外する。呼び出し元(削除APIエンドポイント、
  // PR5で実装)はこれを呼んだ時点で、そのuser_idに対する既存のAccess
  // Token・Refresh Session・Push通知が以後一切機能しないことを
  // 保証できる。
  startAccountDeletion(userId: string): Promise<void>;
}
