import type { ApiErrorDefinition } from './errorResponse';

export const CommonErrors = {
  UNAUTHORIZED: {
    status: 401,
    code: 'UNAUTHORIZED',
    message: '認証が必要です',
  },
  STAFF_REQUIRED: {
    status: 403,
    code: 'STAFF_REQUIRED',
    message: 'この操作にはスタッフ権限が必要です',
  },
  VALIDATION_ERROR: {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'リクエスト内容が正しくありません',
  },
  INVALID_PAGINATION_QUERY: {
    status: 400,
    code: 'INVALID_PAGINATION_QUERY',
    message: 'ページネーション指定が正しくありません',
  },
  EVENT_DATE_INVALID: {
    status: 500,
    code: 'EVENT_DATE_INVALID',
    message: 'イベント日付の設定が正しくありません',
  },
} as const satisfies Record<string, ApiErrorDefinition>;
