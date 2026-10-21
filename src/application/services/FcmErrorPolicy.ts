import { FcmConfigurationError, FcmRequestError } from './IFcmService';

// FCM/OAuthの共通分類。Token不正と設定復旧可能な障害を区別する。
// https://firebase.google.com/docs/cloud-messaging/error-codes
export function classifyFcmError(
  error: unknown
): 'configuration' | 'temporary' | 'permanent' | 'unregistered' {
  if (error instanceof FcmConfigurationError) return 'configuration';
  if (!(error instanceof FcmRequestError)) return 'temporary';
  if (error.fcmErrorCode === 'UNREGISTERED') return 'unregistered';
  if (
    ['INVALID_ARGUMENT', 'SENDER_ID_MISMATCH'].includes(
      error.fcmErrorCode ?? ''
    )
  )
    return 'permanent';
  // OAuth tokenの取得成功だけではFCMのIAM・APNs権限を保証できない。
  if (
    [401, 403].includes(error.httpStatus) ||
    ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'THIRD_PARTY_AUTH_ERROR'].includes(
      error.fcmErrorCode ?? ''
    )
  )
    return 'configuration';
  if (
    [429, 500, 503].includes(error.httpStatus) ||
    ['QUOTA_EXCEEDED', 'INTERNAL', 'UNAVAILABLE'].includes(
      error.fcmErrorCode ?? ''
    )
  )
    return 'temporary';
  return 'permanent';
}
