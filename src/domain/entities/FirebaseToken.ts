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

export function firebasePlatformToCode(
  platform: FirebasePlatformName
): FirebasePlatform {
  return platform === 'ios' ? 1 : 2;
}

export function firebasePlatformToName(
  platform: FirebasePlatform
): FirebasePlatformName {
  return platform === 1 ? 'ios' : 'android';
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
