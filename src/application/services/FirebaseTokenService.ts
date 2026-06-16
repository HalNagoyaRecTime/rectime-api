import {
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../domain/entities/FirebaseToken';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { IFirebaseTokenService } from './IFirebaseTokenService';

export function createFirebaseTokenService(
  firebaseTokenRepository: IFirebaseTokenRepository
): IFirebaseTokenService {
  return {
    async registerFirebaseToken(
      input: RegisterFirebaseTokenInput
    ): Promise<RegisterFirebaseTokenResult> {
      return firebaseTokenRepository.register(input);
    },
  };
}
