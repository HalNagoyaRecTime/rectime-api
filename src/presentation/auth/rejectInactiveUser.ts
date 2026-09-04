import type { AppContext } from './helpers';
import { AuthErrors } from '../errors/authErrors';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';

// 認証済みユーザーが「今この瞬間もアクセスを許されているか」を確認する(#255)。
// 通してよければ null、断るべきならそのまま返せるレスポンスを返す。
// JWTは発行時点の情報しか持たないため、無効化を即座に反映するには
// リクエストごとに現在の状態をDBで確認するしかない。
export async function rejectInactiveUser(
  c: AppContext,
  sub: string | number
): Promise<Response | null> {
  const userId = Number(sub);
  // subがユーザーIDとして解釈できない場合は状態を確認できないため通さない
  // (フェイルクローズ)。
  if (!Number.isInteger(userId) || userId <= 0) {
    return errorResponse(c, CommonErrors.UNAUTHORIZED);
  }

  let isActive: boolean;
  try {
    isActive = await c
      .get('container')
      .userActivationRepository.isActive(userId);
  } catch (error) {
    // D1が一時的に不調な場合。素通りはさせないが、Honoの既定の500ではなく
    // アプリ標準のエラー形式で返して切り分けできるようにする。
    console.error('Failed to check user activation', error);
    return errorResponse(c, AuthErrors.USER_ACTIVATION_CHECK_FAILED);
  }

  if (!isActive) {
    return errorResponse(c, AuthErrors.USER_DEACTIVATED);
  }

  return null;
}
