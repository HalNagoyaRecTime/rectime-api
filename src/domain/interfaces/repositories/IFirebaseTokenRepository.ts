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
  findActiveTokensForEvents: (
    eventIds: number[]
  ) => Promise<Map<number, FirebaseTokenEntity[]>>;
  deactivate: (id: number) => Promise<void>;
}
