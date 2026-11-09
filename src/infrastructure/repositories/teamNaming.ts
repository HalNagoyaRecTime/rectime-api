import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';

// チーム名は所属クラスのclass_codeをclass_room_idの登録順(作成順)で連結した
// ものである必要がある。リクエストに渡されたclass_codesの並び順をそのまま
// 使うと、呼び出し側の指定順に左右されてしまうため、常にDB上の登録順を
// 正として名前を再計算する。
//
// 所属クラスが0件になった編成は、名前を空にせず(team_name NOT NULLに違反する)
// 据え置く。空になった編成はteamCleanupで削除されるため、名前は見られない。
// 計算結果が今の名前と同じ場合は何もしない。無関係な更新のたびにteamの
// updated_atだけが進んでしまうのを防ぐため。
export function buildRecalculateTeamNameStatement(
  db: D1Database,
  teamId: number
): D1PreparedStatement {
  const newNameExpr = `(
    SELECT GROUP_CONCAT(class_code, ' ') FROM (
      SELECT class_code FROM class_rooms
      WHERE team_id = ?
      ORDER BY class_room_id ASC
    )
  )`;
  return db
    .prepare(
      `UPDATE teams
         SET team_name = ${newNameExpr},
             updated_at = CURRENT_TIMESTAMP
       WHERE team_id = ?
         AND EXISTS (SELECT 1 FROM class_rooms WHERE team_id = ?)
         AND team_name IS NOT ${newNameExpr}`
    )
    .bind(teamId, teamId, teamId, teamId);
}
