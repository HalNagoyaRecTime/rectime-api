import type { AppUser, Session } from '../../domain/auth/types';
import type { IdTokenClaims } from '../../infrastructure/auth/verifyIdToken';

export interface IAuthService {
  upsertUser(claims: IdTokenClaims): Promise<AppUser>;
  saveSession(sessionId: string, session: Session): Promise<void>;
}
