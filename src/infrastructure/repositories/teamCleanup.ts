// 所属クラスが0件になった編成を掃除するための共通SQL。
// team_scoresは行の有無ではなく得点が0かどうかで判定する。
// +100点した後に-100点して合計が0に戻ったケースは、行自体は残っている
// (INSERT ... ON CONFLICT DO UPDATEのUPSERTのため)。行の有無だけを見ると、
// 実質0点の編成が永久にランキングへ残り続けてしまう。
export const CLEANUP_EMPTY_TEAM_SQL = `
      DELETE FROM teams
      WHERE team_id = ?
      AND NOT EXISTS (SELECT 1 FROM class_rooms WHERE team_id = ?)
      AND NOT EXISTS (SELECT 1 FROM team_scores WHERE team_id = ? AND scores <> 0)
    `;
