import type { AppUser, MicrosoftClaims } from '../../domain/auth/types';

export type { MicrosoftClaims };

export interface IAuthService {
  upsertUser(claims: MicrosoftClaims): Promise<AppUser>;
}
