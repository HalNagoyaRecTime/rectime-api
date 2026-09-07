import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IAuthorizationService } from './IAuthorizationService';

export function createAuthorizationService(
  userRepository: IUserRepository
): IAuthorizationService {
  return {
    isStaff(userId: number): Promise<boolean> {
      return userRepository.isStaff(userId);
    },
  };
}
