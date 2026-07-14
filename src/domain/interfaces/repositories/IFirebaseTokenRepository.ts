import {
  FirebaseTokenEntity,
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../entities/FirebaseToken';

export interface IFirebaseTokenRepository {
  register: (
    input: RegisterFirebaseTokenInput
  ) => Promise<RegisterFirebaseTokenResult>;
  findActiveTokensForEvent: (eventId: number) => Promise<FirebaseTokenEntity[]>;
  findActiveTokensForAllUsers: () => Promise<FirebaseTokenEntity[]>;
  findActiveTokensForGroups: (
    targetIds: string[]
  ) => Promise<FirebaseTokenEntity[]>;
  deactivate: (id: number) => Promise<void>;
}
