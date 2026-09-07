import type { ApiErrorDefinition } from './errorResponse';

export const NotificationErrors = {
  INVALID_MANUAL_NOTIFICATION_REQUEST: {
    status: 400,
    code: 'INVALID_MANUAL_NOTIFICATION_REQUEST',
    message: '通知の入力内容が正しくありません',
  },
  INVALID_NOTIFICATION_DATE: {
    status: 400,
    code: 'INVALID_NOTIFICATION_DATE',
    message: '配信日時はイベント開催日に設定してください',
  },
  NOTIFICATION_AUDIENCE_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_AUDIENCE_NOT_FOUND',
    message: '選択した通知対象が見つかりません',
  },
  NOTIFICATION_AUDIENCE_HAS_NO_TOKENS: {
    status: 409,
    code: 'NOTIFICATION_AUDIENCE_HAS_NO_TOKENS',
    message: '通知対象に有効な端末がありません',
  },
  MANUAL_NOTIFICATION_CREATE_FAILED: {
    status: 500,
    code: 'MANUAL_NOTIFICATION_CREATE_FAILED',
    message: '通知の作成に失敗しました',
  },
  INVALID_ADMIN_NOTIFICATION_QUERY: {
    status: 400,
    code: 'INVALID_ADMIN_NOTIFICATION_QUERY',
    message: '通知一覧の検索条件が正しくありません',
  },
  INVALID_ADMIN_NOTIFICATION_REQUEST: {
    status: 400,
    code: 'INVALID_ADMIN_NOTIFICATION_REQUEST',
    message: '通知の更新内容が正しくありません',
  },
  INVALID_NOTIFICATION_ID: {
    status: 400,
    code: 'INVALID_NOTIFICATION_ID',
    message: '通知IDが正しくありません',
  },
  ADMIN_NOTIFICATION_NOT_FOUND: {
    status: 404,
    code: 'ADMIN_NOTIFICATION_NOT_FOUND',
    message: '通知が見つかりません',
  },
  ADMIN_NOTIFICATION_NOT_DRAFT: {
    status: 409,
    code: 'ADMIN_NOTIFICATION_NOT_DRAFT',
    message: '下書き状態の通知のみ変更または削除できます',
  },
  ADMIN_NOTIFICATION_LIST_FAILED: {
    status: 500,
    code: 'ADMIN_NOTIFICATION_LIST_FAILED',
    message: '通知一覧の取得に失敗しました',
  },
  ADMIN_NOTIFICATION_FETCH_FAILED: {
    status: 500,
    code: 'ADMIN_NOTIFICATION_FETCH_FAILED',
    message: '通知の取得に失敗しました',
  },
  ADMIN_NOTIFICATION_UPDATE_FAILED: {
    status: 500,
    code: 'ADMIN_NOTIFICATION_UPDATE_FAILED',
    message: '通知の更新に失敗しました',
  },
  ADMIN_NOTIFICATION_DELETE_FAILED: {
    status: 500,
    code: 'ADMIN_NOTIFICATION_DELETE_FAILED',
    message: '通知の削除に失敗しました',
  },
  INVALID_NOTIFICATION_REQUEST: {
    status: 400,
    code: 'INVALID_NOTIFICATION_REQUEST',
    message: '通知の入力内容が正しくありません',
  },
  INVALID_NOTIFICATION_QUERY: {
    status: 400,
    code: 'INVALID_NOTIFICATION_QUERY',
    message: '通知一覧の検索条件が正しくありません',
  },
  INVALID_NOTIFICATION_LIST_QUERY: {
    status: 400,
    code: 'INVALID_NOTIFICATION_LIST_QUERY',
    message: '通知一覧の検索条件が正しくありません',
  },
  NOTIFICATION_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_NOT_FOUND',
    message: '通知が見つかりません',
  },
  NOTIFICATION_CREATE_FAILED: {
    status: 500,
    code: 'NOTIFICATION_CREATE_FAILED',
    message: '通知の作成に失敗しました',
  },
  NOTIFICATION_LIST_FAILED: {
    status: 500,
    code: 'NOTIFICATION_LIST_FAILED',
    message: '通知一覧の取得に失敗しました',
  },
  NOTIFICATION_FETCH_FAILED: {
    status: 500,
    code: 'NOTIFICATION_FETCH_FAILED',
    message: '通知の取得に失敗しました',
  },
  NOTIFICATION_UPDATE_FAILED: {
    status: 500,
    code: 'NOTIFICATION_UPDATE_FAILED',
    message: '通知の更新に失敗しました',
  },
  TEST_NOTIFICATION_SEND_FAILED: {
    status: 500,
    code: 'TEST_NOTIFICATION_SEND_FAILED',
    message: 'テスト通知の送信に失敗しました',
  },
  INVALID_NOTIFICATION_SCHEDULE_QUERY: {
    status: 400,
    code: 'INVALID_NOTIFICATION_SCHEDULE_QUERY',
    message: '通知スケジュール一覧の検索条件が正しくありません',
  },
  INVALID_NOTIFICATION_SCHEDULE_ID: {
    status: 400,
    code: 'INVALID_NOTIFICATION_SCHEDULE_ID',
    message: '通知スケジュールIDが正しくありません',
  },
  INVALID_NOTIFICATION_SCHEDULE_REQUEST: {
    status: 400,
    code: 'INVALID_NOTIFICATION_SCHEDULE_REQUEST',
    message: '通知スケジュールの入力内容が正しくありません',
  },
  NOTIFICATION_SCHEDULE_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_SCHEDULE_NOT_FOUND',
    message: '通知スケジュールが見つかりません',
  },
  NOTIFICATION_SCHEDULE_NOT_DRAFT: {
    status: 409,
    code: 'NOTIFICATION_SCHEDULE_NOT_DRAFT',
    message: '下書き状態の通知スケジュールのみ削除できます',
  },
  NOTIFICATION_SCHEDULE_LIST_FAILED: {
    status: 500,
    code: 'NOTIFICATION_SCHEDULE_LIST_FAILED',
    message: '通知スケジュール一覧の取得に失敗しました',
  },
  NOTIFICATION_SCHEDULE_FETCH_FAILED: {
    status: 500,
    code: 'NOTIFICATION_SCHEDULE_FETCH_FAILED',
    message: '通知スケジュールの取得に失敗しました',
  },
  NOTIFICATION_SCHEDULE_CREATE_FAILED: {
    status: 500,
    code: 'NOTIFICATION_SCHEDULE_CREATE_FAILED',
    message: '通知スケジュールの作成に失敗しました',
  },
  NOTIFICATION_SCHEDULE_DELETE_FAILED: {
    status: 500,
    code: 'NOTIFICATION_SCHEDULE_DELETE_FAILED',
    message: '通知スケジュールの削除に失敗しました',
  },
  FIREBASE_TOKEN_NOT_FOUND: {
    status: 404,
    code: 'FIREBASE_TOKEN_NOT_FOUND',
    message: 'Firebaseトークンが見つかりません',
  },
  INVALID_FIREBASE_TOKEN_REQUEST: {
    status: 400,
    code: 'INVALID_FIREBASE_TOKEN_REQUEST',
    message: 'Firebaseトークンの入力内容が正しくありません',
  },
  FIREBASE_TOKEN_REGISTRATION_CONFLICT: {
    status: 409,
    code: 'FIREBASE_TOKEN_REGISTRATION_CONFLICT',
    message: '別のリクエストでFirebaseトークンを登録中です',
  },
  FIREBASE_TOKEN_REGISTRATION_FAILED: {
    status: 500,
    code: 'FIREBASE_TOKEN_REGISTRATION_FAILED',
    message: 'Firebaseトークンの登録に失敗しました',
  },
  INVALID_SCHEDULE_DATA: {
    status: 400,
    code: 'INVALID_SCHEDULE_DATA',
    message: 'スケジュールの入力内容が正しくありません',
  },
  SCHEDULE_NOT_DRAFT: {
    status: 409,
    code: 'SCHEDULE_NOT_DRAFT',
    message: '下書き状態のスケジュールのみ更新できます',
  },
  SCHEDULE_UPDATE_FAILED: {
    status: 500,
    code: 'SCHEDULE_UPDATE_FAILED',
    message: 'スケジュールの更新に失敗しました',
  },
} as const satisfies Record<string, ApiErrorDefinition>;
