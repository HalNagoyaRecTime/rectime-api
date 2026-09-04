import type { ApiErrorDefinition } from './errorResponse';

export const TeamErrors = {
  INVALID_TEAM_ID: {
    status: 400,
    code: 'INVALID_TEAM_ID',
    message: 'チームIDが正しくありません',
  },
  INVALID_RANKING_LIST_QUERY: {
    status: 400,
    code: 'INVALID_RANKING_LIST_QUERY',
    message: 'ランキング一覧の検索条件が正しくありません',
  },
  INVALID_TEAM_SCORE_REQUEST: {
    status: 400,
    code: 'INVALID_TEAM_SCORE_REQUEST',
    message: '得点の入力内容が正しくありません',
  },
  TEAM_NOT_FOUND: {
    status: 404,
    code: 'TEAM_NOT_FOUND',
    message: 'チームが見つかりません',
  },
  RANKING_LIST_FAILED: {
    status: 500,
    code: 'RANKING_LIST_FAILED',
    message: 'ランキング一覧の取得に失敗しました',
  },
  TEAM_FETCH_FAILED: {
    status: 500,
    code: 'TEAM_FETCH_FAILED',
    message: 'チームの取得に失敗しました',
  },
  TEAM_SCORE_UPDATE_FAILED: {
    status: 500,
    code: 'TEAM_SCORE_UPDATE_FAILED',
    message: '得点の更新に失敗しました',
  },
} as const satisfies Record<string, ApiErrorDefinition>;
