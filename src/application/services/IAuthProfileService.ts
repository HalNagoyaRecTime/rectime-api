import type {
  AuthProfileIdentityDTO,
  AuthUserProfileDTO,
} from '../dto/AuthUserProfileDTO';

export interface IAuthProfileService {
  getProfile(identity: AuthProfileIdentityDTO): Promise<AuthUserProfileDTO>;
}
