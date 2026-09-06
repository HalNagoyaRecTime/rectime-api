import type { ApiErrorDefinition } from './errorResponse';

export const UserErrors = {
  USER_NOT_FOUND: {
    status: 404,
    code: 'USER_NOT_FOUND',
    message: 'ユーザーが見つかりません',
  },
  INVALID_STAFF_ID: {
    status: 400,
    code: 'INVALID_STAFF_ID',
    message: 'スタッフIDが正しくありません',
  },
  STAFF_NOT_FOUND: {
    status: 404,
    code: 'STAFF_NOT_FOUND',
    message: 'スタッフが見つかりません',
  },
  STAFF_FETCH_FAILED: {
    status: 500,
    code: 'STAFF_FETCH_FAILED',
    message: 'スタッフの取得に失敗しました',
  },
  STAFF_LIST_FAILED: {
    status: 500,
    code: 'STAFF_LIST_FAILED',
    message: 'スタッフ一覧の取得に失敗しました',
  },
  INVALID_STUDENT_ID: {
    status: 400,
    code: 'INVALID_STUDENT_ID',
    message: '学生IDが正しくありません',
  },
  STUDENT_NOT_FOUND: {
    status: 404,
    code: 'STUDENT_NOT_FOUND',
    message: '学生が見つかりません',
  },
  STUDENT_FETCH_FAILED: {
    status: 500,
    code: 'STUDENT_FETCH_FAILED',
    message: '学生の取得に失敗しました',
  },
  INVALID_STUDENT_LIST_QUERY: {
    status: 400,
    code: 'INVALID_STUDENT_LIST_QUERY',
    message: '学生一覧の検索条件が正しくありません',
  },
  STUDENT_LIST_FAILED: {
    status: 500,
    code: 'STUDENT_LIST_FAILED',
    message: '学生一覧の取得に失敗しました',
  },
  INVALID_STUDENT_REQUEST: {
    status: 400,
    code: 'INVALID_STUDENT_REQUEST',
    message: '学生情報の入力内容が正しくありません',
  },
  STUDENT_NUMBER_ALREADY_EXISTS: {
    status: 409,
    code: 'STUDENT_NUMBER_ALREADY_EXISTS',
    message: '同じ学籍番号の学生が既に存在します',
  },
  STUDENT_CREATE_FAILED: {
    status: 500,
    code: 'STUDENT_CREATE_FAILED',
    message: '学生の登録に失敗しました',
  },
  STUDENT_UPDATE_FAILED: {
    status: 500,
    code: 'STUDENT_UPDATE_FAILED',
    message: '学生の更新に失敗しました',
  },
  INVALID_TEACHER_ID: {
    status: 400,
    code: 'INVALID_TEACHER_ID',
    message: '教員IDが正しくありません',
  },
  TEACHER_NOT_FOUND: {
    status: 404,
    code: 'TEACHER_NOT_FOUND',
    message: '教員が見つかりません',
  },
  INVALID_TEACHER_CREATE_REQUEST: {
    status: 400,
    code: 'INVALID_TEACHER_CREATE_REQUEST',
    message: '教員の登録内容が正しくありません',
  },
  INVALID_TEACHER_UPDATE_REQUEST: {
    status: 400,
    code: 'INVALID_TEACHER_UPDATE_REQUEST',
    message: '教員の更新内容が正しくありません',
  },
  TEACHER_FETCH_FAILED: {
    status: 500,
    code: 'TEACHER_FETCH_FAILED',
    message: '教員の取得に失敗しました',
  },
  TEACHER_LIST_FAILED: {
    status: 500,
    code: 'TEACHER_LIST_FAILED',
    message: '教員一覧の取得に失敗しました',
  },
  TEACHER_CREATE_FAILED: {
    status: 500,
    code: 'TEACHER_CREATE_FAILED',
    message: '教員の登録に失敗しました',
  },
  TEACHER_UPDATE_FAILED: {
    status: 500,
    code: 'TEACHER_UPDATE_FAILED',
    message: '教員の更新に失敗しました',
  },
  TEACHER_DELETE_FAILED: {
    status: 500,
    code: 'TEACHER_DELETE_FAILED',
    message: '教員の削除に失敗しました',
  },
  CLASS_ROOM_NOT_FOUND: {
    status: 400,
    code: 'CLASS_ROOM_NOT_FOUND',
    message: '指定されたクラスが見つかりません',
  },
  STUDENT_CLASS_ROOM_NOT_FOUND: {
    status: 404,
    code: 'CLASS_ROOM_NOT_FOUND',
    message: '指定されたクラスが見つかりません',
  },
  INVALID_CLASS_ID: {
    status: 400,
    code: 'INVALID_CLASS_ID',
    message: 'クラスIDが正しくありません',
  },
  CLASS_NOT_FOUND: {
    status: 404,
    code: 'CLASS_NOT_FOUND',
    message: 'クラスが見つかりません',
  },
  INVALID_CLASS_LIST_QUERY: {
    status: 400,
    code: 'INVALID_CLASS_LIST_QUERY',
    message: 'クラス一覧の検索条件が正しくありません',
  },
  INVALID_CLASS_REQUEST: {
    status: 400,
    code: 'INVALID_CLASS_REQUEST',
    message: 'クラス情報の入力内容が正しくありません',
  },
  CLASS_CODE_ALREADY_EXISTS: {
    status: 409,
    code: 'CLASS_CODE_ALREADY_EXISTS',
    message: '同じクラスコードが既に存在します',
  },
  CLASS_REFERENCED_BY_STUDENTS: {
    status: 409,
    code: 'CLASS_REFERENCED_BY_STUDENTS',
    message: '学生が所属しているクラスは削除できません',
  },
  CLASS_LIST_FAILED: {
    status: 500,
    code: 'CLASS_LIST_FAILED',
    message: 'クラス一覧の取得に失敗しました',
  },
  CLASS_FETCH_FAILED: {
    status: 500,
    code: 'CLASS_FETCH_FAILED',
    message: 'クラスの取得に失敗しました',
  },
  CLASS_CREATE_FAILED: {
    status: 500,
    code: 'CLASS_CREATE_FAILED',
    message: 'クラスの登録に失敗しました',
  },
  CLASS_UPDATE_FAILED: {
    status: 500,
    code: 'CLASS_UPDATE_FAILED',
    message: 'クラスの更新に失敗しました',
  },
  CLASS_DELETE_FAILED: {
    status: 500,
    code: 'CLASS_DELETE_FAILED',
    message: 'クラスの削除に失敗しました',
  },
  USER_SEARCH_FORBIDDEN: {
    status: 403,
    code: 'USER_SEARCH_FORBIDDEN',
    message: 'ユーザーを検索する権限がありません',
  },
  INVALID_USER_SEARCH_QUERY: {
    status: 400,
    code: 'INVALID_USER_SEARCH_QUERY',
    message: 'ユーザーの検索条件が正しくありません',
  },
  USER_SEARCH_FAILED: {
    status: 500,
    code: 'USER_SEARCH_FAILED',
    message: 'ユーザーの検索に失敗しました',
  },
} as const satisfies Record<string, ApiErrorDefinition>;
