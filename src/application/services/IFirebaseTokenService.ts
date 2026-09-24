import type { FirebaseTokenDTO } from '../dto/FirebaseTokenDTO';
import { RegisterFirebaseTokenInput } from '../../domain/entities/FirebaseToken';

export interface IFirebaseTokenService {
  registerFirebaseToken: (
    input: RegisterFirebaseTokenInput
  ) => Promise<FirebaseTokenDTO>;
  deleteFirebaseToken: (
    firebaseTokenId: number,
    userId: number
  ) => Promise<'deleted' | 'forbidden' | 'not_found'>;
}
