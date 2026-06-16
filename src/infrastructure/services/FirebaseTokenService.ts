import {
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../domain/entities/FirebaseToken';
import {
  FirebaseTokenRepositoryFunctions,
  FirebaseTokenServiceFunctions,
} from '../../types';

export function createFirebaseTokenService(
  firebaseTokenRepository: FirebaseTokenRepositoryFunctions
): FirebaseTokenServiceFunctions {
  return {
    async registerFirebaseToken(
      input: RegisterFirebaseTokenInput
    ): Promise<RegisterFirebaseTokenResult> {
      return firebaseTokenRepository.register(input);
    },
  };
}
