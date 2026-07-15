export interface UserEntity {
  user_id: number;
  user_name: string;
  is_live_active: number;
  created_at: string;
  updated_at: string;
}

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

export interface RegisterFirebaseTokenInput {
  studentNumber: string;
  platform: FirebasePlatform;
  fcmToken: string;
}

export interface RegisterFirebaseTokenResult {
  user: UserEntity;
  firebaseToken: FirebaseTokenEntity;
}
