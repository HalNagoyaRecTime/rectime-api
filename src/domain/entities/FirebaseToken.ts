export interface FirebaseTokenEntity {
  firebase_token_id: number;
  user_id: number;
  platform: FirebasePlatform;
  fcm_token: string;
  is_firebase_active: number;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

/** 1: iOS、2: Android */
export type FirebasePlatform = 1 | 2;

export type FirebasePlatformName = 'ios' | 'android';

const PLATFORM_CODE_BY_NAME = {
  ios: 1,
  android: 2,
} as const satisfies Record<FirebasePlatformName, FirebasePlatform>;

const PLATFORM_NAME_BY_CODE: Record<number, FirebasePlatformName> = {
  1: 'ios',
  2: 'android',
};

export function firebasePlatformToCode(
  platform: FirebasePlatformName
): FirebasePlatform {
  return PLATFORM_CODE_BY_NAME[platform];
}

export function firebasePlatformToName(platform: number): FirebasePlatformName {
  const name = PLATFORM_NAME_BY_CODE[platform];
  if (!name) throw new Error(`Unsupported Firebase platform: ${platform}`);
  return name;
}

export interface RegisterFirebaseTokenInput {
  userId: number;
  platform: FirebasePlatformName;
  fcmToken: string;
}

export interface RegisterFirebaseTokenResult {
  firebase_token_id: number;
  user_id: number;
  platform: FirebasePlatformName;
  is_firebase_active: boolean;
  last_seen_at: string;
}
