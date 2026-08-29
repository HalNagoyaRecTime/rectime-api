export type ClientType = 'web' | 'mobile';

// リクエストの認証コンテキスト（bearerAuthenticationMiddleware/requireAuth間で共有）。
// AppUser（DB上のアカウントレコード）とは別に、JWTクレームから直接導出する値。
export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

export interface AppUser {
  id: string;
  oid: string;
  tid: string;
  sub: string;
  email: string;
  display_name: string;
}

// staffs / teachers は相互排他ではない（同一ユーザーが両方の行を持つことを許容する）ため、
// 単一の役割ではなく真偽値の組み合わせで表す。
export interface UserCategories {
  is_student: boolean;
  is_staff: boolean;
  is_teacher: boolean;
}

export interface PkceEntry {
  code_verifier?: string;
  nonce: string;
  client_type: ClientType;
  created_at: string;
}

export interface MicrosoftTokenResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export interface MobileRefreshEntry {
  user_id: string;
  oid: string;
  tid: string;
  sub: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_updated_at?: string | null;
  // 発行時のクライアント種別。/auth/refresh でリクエストヘッダーの
  // X-Client-Type と一致するか検証するために保持する（なりすまし防止）。
  client_type: ClientType;
  ms_refresh_token: string;
  created_at: string;
  updated_at?: string;
}

export interface MicrosoftClaims {
  oid: string;
  tid: string;
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
}

export const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;
export const MICROSOFT_SCOPES = 'openid profile email offline_access User.Read';
export const ACCOUNT_PHOTO_PATH = '/api/v1/auth/me/photo';
