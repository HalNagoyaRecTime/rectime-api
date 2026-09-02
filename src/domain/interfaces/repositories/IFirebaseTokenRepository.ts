import {
  FirebaseTokenEntity,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../entities/FirebaseToken';

export interface IFirebaseTokenRepository {
  register: (
    input: RegisterFirebaseTokenInput
  ) => Promise<RegisterFirebaseTokenResult>;
  deactivateForUser: (userId: number) => Promise<void>;
  findActiveTokens: () => Promise<FirebaseTokenEntity[]>;
  deactivate: (firebaseTokenId: number) => Promise<void>;
}
