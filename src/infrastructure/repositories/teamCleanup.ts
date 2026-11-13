import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';

// 所属クラスが0件になった編成を掃除するための共通処理。
// team_scoresは行の有無ではなく得点が0かどうかで判定する。
// +100点した後に-100点して合計が0に戻ったケースは、行自体は残っている
// (INSERT ... ON CONFLICT DO UPDATEのUPSERTのため)。行の有無だけを見ると、
// 実質0点の編成が永久にランキングへ残り続けてしまう。
// team_scores.team_idはteamsへの外部キーのため、0点の行を残したままteamsを
// 削除しようとするとFK違反になる。0点の行を先に消してからteamsを削除する。
export function buildCleanupEmptyTeamStatements(
  db: D1Database,
  teamId: number
): D1PreparedStatement[] {
  return [
    db
      .prepare('DELETE FROM team_scores WHERE team_id = ? AND scores = 0')
      .bind(teamId),
    db
      .prepare(
        `DELETE FROM teams
         WHERE team_id = ?
         AND NOT EXISTS (SELECT 1 FROM class_rooms WHERE team_id = ?)
         AND NOT EXISTS (SELECT 1 FROM team_scores WHERE team_id = ?)`
      )
      .bind(teamId, teamId, teamId),
    // 得点が残っていて上の削除が行われなかった場合、空になった時点の
    // team_nameのままだと、同じクラスコードで新しく作られる編成がその名前を
    // 確定できずUNIQUE制約へ衝突する。空になった時点で退会済みマーカーを
    // 付けて名前を解放する(team_idを含めるため、付け直しても一意)。
    db
      .prepare(
        `UPDATE teams
           SET team_name = team_name || '(解散#' || team_id || ')',
               updated_at = CURRENT_TIMESTAMP
         WHERE team_id = ?
           AND NOT EXISTS (SELECT 1 FROM class_rooms WHERE team_id = ?)
           AND team_name NOT LIKE '%(解散#' || team_id || ')'`
      )
      .bind(teamId, teamId),
  ];
}
