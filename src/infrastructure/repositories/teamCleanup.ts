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
  ];
}
