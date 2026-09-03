import { createMiddleware } from 'hono/factory';
import type { Env } from '../../lib/env';
import {
  getBearerToken,
  getClientType,
  type AppContext,
} from '../auth/helpers';
import { verifyAccessToken } from '../../infrastructure/auth/jwt';
import { createUserRepository } from '../../infrastructure/repositories/UserRepository';
import type { ContainerVariables } from './diContainer';
import type { AuthUser } from '../../domain/auth/types';

export type AuthenticationVariables = {
  authenticatedUserId: number | null;
  verifiedAuthUser: AuthUser | null;
};

// requireAuthとは独立して、認証済みなら authenticatedUserId / verifiedAuthUser を
// (非強制で)Contextへ設定する。requireAuthが付いていないルートでも
// コントローラー側で権限チェックに使えるようにするためのもの。
//
// トークン検証はここで1回だけ行う。requireAuth（apiV1.use('*', ...)の後段で
// 各ルートに個別付与）はこの verifiedAuthUser をそのまま読むだけにして、
// 同じトークンに対して verifyAccessToken を二重に呼び出さないようにしている。
export const bearerAuthenticationMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>(async (c, next) => {
  const appContext = c as unknown as AppContext;
  const clientType = getClientType(appContext);
  const token = clientType ? getBearerToken(appContext) : null;

  let authenticatedUserId: number | null = null;
  let verifiedAuthUser: AuthUser | null = null;
  if (clientType && token) {
    try {
      const claims = await verifyAccessToken(
        token,
        c.env.JWT_SECRET,
        clientType
      );
      // JWT自体は自己完結検証のためDBの現在状態を反映しない。削除開始
      // (deletion_status !== 'active')後も、exp到達までは有効なAccess
      // Tokenが使えてしまうため、リクエストごとに最新の削除状態を確認し、
      // 削除中・削除済みのユーザーは(有効期限内でも)未認証として扱う。
      const userRepository = createUserRepository(c.env.DB);
      const deletionStatus = await userRepository.getDeletionStatus(claims.sub);
      if (deletionStatus && deletionStatus !== 'active') {
        throw new Error('ACCOUNT_DELETION_PENDING');
      }

      const userId = Number(claims.sub);
      if (Number.isInteger(userId) && userId > 0) {
        authenticatedUserId = userId;
      }
      verifiedAuthUser = {
        id: claims.sub,
        email: claims.email,
        display_name: claims.display_name,
      };
    } catch {
      authenticatedUserId = null;
      verifiedAuthUser = null;
    }
  }

  c.set('authenticatedUserId', authenticatedUserId);
  c.set('verifiedAuthUser', verifiedAuthUser);
  await next();
});
