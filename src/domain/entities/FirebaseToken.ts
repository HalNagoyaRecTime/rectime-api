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
  id: number;
  user_id: number;
  platform: string;
  fcm_token: string;
  is_active: number;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface RegisterFirebaseTokenInput {
  studentNumber: string;
  platform: 'android' | 'ios';
  fcmToken: string;
  authProvider?: string;
  providerUserId?: string;
  email?: string;
}

export interface RegisterFirebaseTokenResult {
  user: UserEntity;
  firebaseToken: FirebaseTokenEntity;
}
