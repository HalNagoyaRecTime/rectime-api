import type {
  AppUser,
  Session,
  MicrosoftClaims,
} from '../../domain/auth/types';

export type { MicrosoftClaims };

export interface IAuthService {
  upsertUser(claims: MicrosoftClaims): Promise<AppUser>;
  saveSession(sessionId: string, session: Session): Promise<void>;
}
