// GET/PUT /gatherings/:gatheringId/members はmobile側の学生アプリからも
// 認証済み全ユーザーが呼べるため、display_nameは含めない。含めると任意の
// ユーザーが他のgatheringIdを指定するだけで参加者全員の実名を取得できてしまう。
export interface GatheringMemberSummary {
  user_id: number;
}
