import type { ApiErrorDefinition } from './errorResponse';

export const NotificationContractErrors = {
  NOTIFICATION_IMPORTANCE_FORBIDDEN: {
    status: 403,
    code: 'NOTIFICATION_IMPORTANCE_FORBIDDEN',
    message: '指定された通知重要度は利用できません',
  },
  FIREBASE_TOKEN_REGISTRATION_FAILED: {
    status: 500,
    code: 'FIREBASE_TOKEN_REGISTRATION_FAILED',
    message: 'Firebaseトークンの登録に失敗しました',
  },
  ADMIN_NOTIFICATION_NOT_FOUND: {
    status: 404,
    code: 'ADMIN_NOTIFICATION_NOT_FOUND',
    message: '通知が見つかりません',
  },
  NOTIFICATION_AUDIENCE_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_AUDIENCE_NOT_FOUND',
    message: '選択した通知対象が見つかりません',
  },
  NOTIFICATION_PUSH_DELIVERY_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_PUSH_DELIVERY_NOT_FOUND',
    message: 'Push配信が見つかりません',
  },
  NOTIFICATION_SCHEDULE_NOT_FOUND: {
    status: 404,
    code: 'NOTIFICATION_SCHEDULE_NOT_FOUND',
    message: '通知スケジュールが見つかりません',
  },
  NOTIFICATION_EDIT_NOT_ALLOWED: {
    status: 409,
    code: 'NOTIFICATION_EDIT_NOT_ALLOWED',
    message: 'この通知は編集できません',
  },
  NOTIFICATION_DELETE_NOT_ALLOWED: {
    status: 409,
    code: 'NOTIFICATION_DELETE_NOT_ALLOWED',
    message: 'この通知は削除できません',
  },
  NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED: {
    status: 409,
    code: 'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED',
    message: 'この通知スケジュールはキャンセルできません',
  },
  NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED: {
    status: 409,
    code: 'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED',
    message: 'この通知スケジュールは停止できません',
  },
  NOTIFICATION_RESEND_NOT_ALLOWED: {
    status: 409,
    code: 'NOTIFICATION_RESEND_NOT_ALLOWED',
    message: 'この通知スケジュールは再送できません',
  },
} as const satisfies Record<string, ApiErrorDefinition>;
