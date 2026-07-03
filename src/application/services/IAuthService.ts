import type { AppUser, Session } from '../../domain/auth/types';

export interface MicrosoftClaims {
  oid: string;
  tid: string;
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
}

export interface IAuthService {
  upsertUser(claims: MicrosoftClaims): Promise<AppUser>;
  saveSession(sessionId: string, session: Session): Promise<void>;
}
