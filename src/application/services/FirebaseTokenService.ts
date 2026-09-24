import type { FirebaseTokenDTO } from '../dto/FirebaseTokenDTO';
import {
  RegisterFirebaseTokenInput,
  RegisterFirebaseTokenResult,
} from '../../domain/entities/FirebaseToken';
import { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';
import { IFirebaseTokenService } from './IFirebaseTokenService';

function toFirebaseTokenDTO(
  result: RegisterFirebaseTokenResult
): FirebaseTokenDTO {
  const timestamp = result.last_seen_at.includes('T')
    ? result.last_seen_at
    : result.last_seen_at.replace(' ', 'T') + 'Z';

  return {
    firebaseTokenId: result.firebase_token_id,
    userId: result.user_id,
    platform: result.platform,
    lastSeenAt: new Date(timestamp).toISOString(),
  };
}

export function createFirebaseTokenService(
  firebaseTokenRepository: IFirebaseTokenRepository
): IFirebaseTokenService {
  return {
    async registerFirebaseToken(
      input: RegisterFirebaseTokenInput
    ): Promise<FirebaseTokenDTO> {
      const result = await firebaseTokenRepository.register(input);
      return toFirebaseTokenDTO(result);
    },

    async deleteFirebaseToken(
      firebaseTokenId: number,
      userId: number
    ): Promise<'deleted' | 'forbidden' | 'not_found'> {
      return firebaseTokenRepository.deleteOwnedById(firebaseTokenId, userId);
    },
  };
}
