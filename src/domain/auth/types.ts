export type ClientType = 'web' | 'mobile';

export interface AppUser {
  id: string;
  oid: string;
  tid: string;
  sub: string;
  email: string;
  display_name: string;
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

export interface Session {
  user_id: string;
  oid: string;
  tid: string;
  sub: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  avatar_updated_at?: string | null;
  ms_refresh_token?: string;
  expires_at: string;
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
  ms_refresh_token: string;
  created_at: string;
  updated_at?: string;
}

export const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;
export const MICROSOFT_SCOPES = 'openid profile email offline_access User.Read';
export const ACCOUNT_PHOTO_PATH = '/api/v1/auth/me/photo';
