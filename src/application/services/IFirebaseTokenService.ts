import {
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../domain/entities/FirebaseToken';

export interface IFirebaseTokenService {
  registerFirebaseToken: (
    input: RegisterFirebaseTokenInput
  ) => Promise<RegisterFirebaseTokenResult>;
  unregisterFirebaseToken: (userId: number) => Promise<void>;
}
