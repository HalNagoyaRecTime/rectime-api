import type { ApiErrorDefinition } from './errorResponse';

export const AuthErrors = {
  INVALID_CLIENT_TYPE: {
    status: 400,
    code: 'INVALID_CLIENT_TYPE',
    message: 'クライアント種別が不正です',
  },
  INVALID_REQUEST: {
    status: 400,
    code: 'INVALID_REQUEST',
    message: 'リクエスト内容が正しくありません',
  },
  STATE_ALREADY_EXISTS: {
    status: 400,
    code: 'STATE_ALREADY_EXISTS',
    message: '同じ state の認証処理がすでに開始されています',
  },
  STATE_MISMATCH: {
    status: 401,
    code: 'STATE_MISMATCH',
    message: 'state が一致しないか期限切れです',
  },
  INVALID_STATE_CLIENT_TYPE: {
    status: 400,
    code: 'INVALID_STATE_CLIENT_TYPE',
    message: 'state のクライアント種別が不正です',
  },
  CODE_VERIFIER_MISSING: {
    status: 401,
    code: 'CODE_VERIFIER_MISSING',
    message:
      'code_verifier が見つかりません。もう一度ログインをやり直してください',
  },
  TOKEN_EXCHANGE_FAILED: {
    status: 401,
    code: 'TOKEN_EXCHANGE_FAILED',
    message: 'Microsoft とのトークン交換に失敗しました',
  },
  INVALID_ID_TOKEN: {
    status: 401,
    code: 'INVALID_ID_TOKEN',
    message: 'id_token の検証に失敗しました',
  },
  STUDENT_ALREADY_LINKED: {
    status: 409,
    code: 'STUDENT_ALREADY_LINKED',
    message: 'この学生は既に別のMicrosoftアカウントと連携されています',
  },
  ACCOUNT_DELETION_PENDING: {
    status: 410,
    code: 'ACCOUNT_DELETION_PENDING',
    message:
      'このアカウントは削除処理中または削除済みのため、ログインできません',
  },
  INVALID_STATE_PURPOSE: {
    status: 400,
    code: 'INVALID_STATE_PURPOSE',
    message: 'state の用途が不正です',
  },
  ACCOUNT_NOT_FOUND: {
    status: 404,
    code: 'ACCOUNT_NOT_FOUND',
    message: 'このMicrosoftアカウントに対応するアカウントが見つかりません',
  },
  SESSION_EXPIRED: {
    status: 401,
    code: 'SESSION_EXPIRED',
    message: 'セッションの有効期限が切れました。もう一度ログインしてください',
  },
  INVALID_TOKEN: {
    status: 401,
    code: 'INVALID_TOKEN',
    message: '認証トークンが不正です',
  },
  GRAPH_TOKEN_EXCHANGE_FAILED: {
    status: 401,
    code: 'GRAPH_TOKEN_EXCHANGE_FAILED',
    message: 'Microsoft Graph のアクセストークン取得に失敗しました',
  },
  PHOTO_NOT_FOUND: {
    status: 404,
    code: 'PHOTO_NOT_FOUND',
    message: 'Microsoft アカウントに写真が登録されていません',
  },
  PHOTO_FETCH_FAILED: {
    status: 401,
    code: 'PHOTO_FETCH_FAILED',
    message: 'Microsoft Graph から写真を取得できませんでした',
  },
  INVALID_REFRESH_CLIENT_TYPE: {
    status: 400,
    code: 'INVALID_REFRESH_CLIENT_TYPE',
    message: 'refresh_token_id のクライアント種別が不正です',
  },
  REFRESH_TOKEN_EXPIRED: {
    status: 401,
    code: 'REFRESH_TOKEN_EXPIRED',
    message: 'セッションを更新できませんでした。もう一度ログインしてください',
  },
  DELETION_CONFIRMATION_TOKEN_INVALID: {
    status: 401,
    code: 'DELETION_CONFIRMATION_TOKEN_INVALID',
    message:
      '削除確認が無効です。もう一度Microsoftアカウントで本人確認をやり直してください',
  },
} as const satisfies Record<string, ApiErrorDefinition>;
