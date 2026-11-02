import type { FirebasePlatformName } from '../../domain/entities/FirebaseToken';

export type FirebaseTokenPlatformDTO = FirebasePlatformName;

export interface FirebaseTokenRegistrationRequestDTO {
  fcmToken: string;
  platform: FirebaseTokenPlatformDTO;
}

export interface FirebaseTokenDTO {
  firebaseTokenId: number;
  userId: number;
  platform: FirebaseTokenPlatformDTO;
  lastSeenAt: string;
}

export type FirebaseTokenRegistrationResponseDTO = FirebaseTokenDTO;
