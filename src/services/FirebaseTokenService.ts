import {
  FirebaseTokenRepositoryFunctions,
  FirebaseTokenServiceFunctions,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../types';

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
