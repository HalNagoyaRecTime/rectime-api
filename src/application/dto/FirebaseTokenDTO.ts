export type FirebaseTokenPlatformDTO = 'ios' | 'android';

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
