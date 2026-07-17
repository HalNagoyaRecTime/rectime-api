export interface UserEntity {
  id: number;
  auth_provider: string | null;
  provider_user_id: string | null;
  email: string | null;
  student_number: string;
  is_active: number;
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
  authProvider?: string;
  providerUserId?: string;
  email?: string;
}

export interface RegisterFirebaseTokenResult {
  user: UserEntity;
  firebaseToken: FirebaseTokenEntity;
}
