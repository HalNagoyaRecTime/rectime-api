import type { ApiErrorDefinition } from './errorResponse';

export const EventErrors = {
  INVALID_START_TIME: {
    status: 400,
    code: 'INVALID_START_TIME',
    message: '開始時刻の指定が正しくありません',
  },
  INVALID_EVENT_ID: {
    status: 400,
    code: 'INVALID_EVENT_ID',
    message: '競技IDが正しくありません',
  },
  INVALID_EVENT_REQUEST: {
    status: 400,
    code: 'INVALID_EVENT_REQUEST',
    message: '競技情報の入力内容が正しくありません',
  },
  INVALID_EVENT_TIME_RANGE: {
    status: 400,
    code: 'INVALID_EVENT_TIME_RANGE',
    message: '終了時刻は開始時刻より後に設定してください',
  },
  EVENT_NOT_FOUND: {
    status: 404,
    code: 'EVENT_NOT_FOUND',
    message: '競技が見つかりません',
  },
  EVENT_IN_USE: {
    status: 409,
    code: 'EVENT_IN_USE',
    message: '使用中の競技は削除できません',
  },
  EVENT_UPDATE_CONFLICT: {
    status: 409,
    code: 'EVENT_UPDATE_CONFLICT',
    message:
      '競技情報の更新が競合しました。再読み込みしてから再度お試しください',
  },
  EVENT_LIST_FAILED: {
    status: 500,
    code: 'EVENT_LIST_FAILED',
    message: '競技一覧の取得に失敗しました',
  },
  MY_EVENT_LIST_FAILED: {
    status: 500,
    code: 'MY_EVENT_LIST_FAILED',
    message: '参加競技一覧の取得に失敗しました',
  },
  EVENT_FETCH_FAILED: {
    status: 500,
    code: 'EVENT_FETCH_FAILED',
    message: '競技の取得に失敗しました',
  },
  EVENT_CREATE_FAILED: {
    status: 500,
    code: 'EVENT_CREATE_FAILED',
    message: '競技の登録に失敗しました',
  },
  EVENT_UPDATE_FAILED: {
    status: 500,
    code: 'EVENT_UPDATE_FAILED',
    message: '競技の更新に失敗しました',
  },
  EVENT_DELETE_FAILED: {
    status: 500,
    code: 'EVENT_DELETE_FAILED',
    message: '競技の削除に失敗しました',
  },
  INVALID_EVENT_SCHEDULE_REQUEST: {
    status: 400,
    code: 'INVALID_EVENT_SCHEDULE_REQUEST',
    message: '競技スケジュールの入力内容が正しくありません',
  },
  EVENT_SCHEDULE_UPDATE_FAILED: {
    status: 500,
    code: 'EVENT_SCHEDULE_UPDATE_FAILED',
    message: '競技スケジュールの更新に失敗しました',
  },
  EVENT_NOTIFICATION_SUMMARY_FAILED: {
    status: 500,
    code: 'EVENT_NOTIFICATION_SUMMARY_FAILED',
    message: '競技の通知状況の取得に失敗しました',
  },
  INVALID_GATHERING_ID: {
    status: 400,
    code: 'INVALID_GATHERING_ID',
    message: '集合グループIDが正しくありません',
  },
  INVALID_GATHERING_REQUEST: {
    status: 400,
    code: 'INVALID_GATHERING_REQUEST',
    message: '集合グループの入力内容が正しくありません',
  },
  GATHERING_NOT_FOUND: {
    status: 404,
    code: 'GATHERING_NOT_FOUND',
    message: '集合グループが見つかりません',
  },
  GATHERING_LIST_FAILED: {
    status: 500,
    code: 'GATHERING_LIST_FAILED',
    message: '集合グループ一覧の取得に失敗しました',
  },
  EVENT_GATHERING_LIST_FAILED: {
    status: 500,
    code: 'EVENT_GATHERING_LIST_FAILED',
    message: '競技の集合グループ一覧の取得に失敗しました',
  },
  GATHERING_CREATE_FAILED: {
    status: 500,
    code: 'GATHERING_CREATE_FAILED',
    message: '集合グループの登録に失敗しました',
  },
  GATHERING_DELETE_FAILED: {
    status: 500,
    code: 'GATHERING_DELETE_FAILED',
    message: '集合グループの削除に失敗しました',
  },
  INVALID_GATHERING_MEMBER_REQUEST: {
    status: 400,
    code: 'INVALID_GATHERING_MEMBER_REQUEST',
    message: '集合メンバーの入力内容が正しくありません',
  },
  INVALID_GATHERING_MEMBER_ID: {
    status: 400,
    code: 'INVALID_GATHERING_MEMBER_ID',
    message: '集合メンバーIDが正しくありません',
  },
  GATHERING_MEMBER_ALREADY_EXISTS: {
    status: 409,
    code: 'GATHERING_MEMBER_ALREADY_EXISTS',
    message: '指定されたユーザーは既に集合メンバーです',
  },
  GATHERING_MEMBER_NOT_FOUND: {
    status: 404,
    code: 'GATHERING_MEMBER_NOT_FOUND',
    message: '集合メンバーが見つかりません',
  },
  GATHERING_MEMBER_LIST_FAILED: {
    status: 500,
    code: 'GATHERING_MEMBER_LIST_FAILED',
    message: '集合メンバー一覧の取得に失敗しました',
  },
  GATHERING_MEMBER_ADD_FAILED: {
    status: 500,
    code: 'GATHERING_MEMBER_ADD_FAILED',
    message: '集合メンバーの追加に失敗しました',
  },
  GATHERING_MEMBER_REMOVE_FAILED: {
    status: 500,
    code: 'GATHERING_MEMBER_REMOVE_FAILED',
    message: '集合メンバーの削除に失敗しました',
  },
  INVALID_GATHERING_SPOT_LIST_QUERY: {
    status: 400,
    code: 'INVALID_GATHERING_SPOT_LIST_QUERY',
    message: '集合場所一覧の検索条件が正しくありません',
  },
  INVALID_GATHERING_SPOT_ID: {
    status: 400,
    code: 'INVALID_GATHERING_SPOT_ID',
    message: '集合場所IDが正しくありません',
  },
  INVALID_GATHERING_SPOT_REQUEST: {
    status: 400,
    code: 'INVALID_GATHERING_SPOT_REQUEST',
    message: '集合場所の入力内容が正しくありません',
  },
  GATHERING_SPOT_NOT_FOUND: {
    status: 404,
    code: 'GATHERING_SPOT_NOT_FOUND',
    message: '集合場所が見つかりません',
  },
  GATHERING_SPOT_IN_USE: {
    status: 409,
    code: 'GATHERING_SPOT_IN_USE',
    message: '使用中の集合場所は削除できません',
  },
  GATHERING_SPOT_LIST_FAILED: {
    status: 500,
    code: 'GATHERING_SPOT_LIST_FAILED',
    message: '集合場所一覧の取得に失敗しました',
  },
  GATHERING_SPOT_FETCH_FAILED: {
    status: 500,
    code: 'GATHERING_SPOT_FETCH_FAILED',
    message: '集合場所の取得に失敗しました',
  },
  GATHERING_SPOT_CREATE_FAILED: {
    status: 500,
    code: 'GATHERING_SPOT_CREATE_FAILED',
    message: '集合場所の登録に失敗しました',
  },
  GATHERING_SPOT_UPDATE_FAILED: {
    status: 500,
    code: 'GATHERING_SPOT_UPDATE_FAILED',
    message: '集合場所の更新に失敗しました',
  },
  GATHERING_SPOT_DELETE_FAILED: {
    status: 500,
    code: 'GATHERING_SPOT_DELETE_FAILED',
    message: '集合場所の削除に失敗しました',
  },
} as const satisfies Record<string, ApiErrorDefinition>;
