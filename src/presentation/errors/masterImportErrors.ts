import type { ApiErrorDefinition } from './errorResponse';

export const MasterImportErrors = {
  INVALID_MULTIPART_REQUEST: {
    status: 400,
    code: 'INVALID_MULTIPART_REQUEST',
    message: 'アップロード形式が正しくありません',
  },
  INVALID_IMPORT_TYPE: {
    status: 400,
    code: 'INVALID_IMPORT_TYPE',
    message: '取込対象の種別が正しくありません',
  },
  IMPORT_FILE_REQUIRED: {
    status: 400,
    code: 'IMPORT_FILE_REQUIRED',
    message: '取込ファイルを指定してください',
  },
  IMPORT_FILE_INVALID: {
    status: 400,
    code: 'IMPORT_FILE_INVALID',
    message: '取込ファイルを読み取れませんでした',
  },
  INVALID_IMPORT_ID: {
    status: 400,
    code: 'INVALID_IMPORT_ID',
    message: '取込IDが正しくありません',
  },
  IMPORT_NOT_FOUND: {
    status: 404,
    code: 'IMPORT_NOT_FOUND',
    message: '取込データが見つかりません',
  },
  IMPORT_EXPIRED: {
    status: 404,
    code: 'IMPORT_EXPIRED',
    message: '取込データの有効期限が切れています',
  },
  COMMIT_IN_PROGRESS: {
    status: 503,
    code: 'COMMIT_IN_PROGRESS',
    message: '確定処理を実行中です。しばらく待ってから再試行してください',
  },
  IMPORT_FETCH_FAILED: {
    status: 500,
    code: 'IMPORT_FETCH_FAILED',
    message: '取込データの取得に失敗しました',
  },
  IMPORT_COMMIT_FAILED: {
    status: 500,
    code: 'IMPORT_COMMIT_FAILED',
    message: '取込データの確定に失敗しました',
  },
} as const satisfies Record<string, ApiErrorDefinition>;
