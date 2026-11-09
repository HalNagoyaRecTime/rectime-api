import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';

// チーム名は所属クラスのclass_codeをclass_room_idの登録順(作成順)で連結した
// ものである必要がある。リクエストに渡されたclass_codesの並び順をそのまま
// 使うと、呼び出し側の指定順に左右されてしまうため、常にDB上の登録順を
// 正として名前を再計算する。
//
// teamIdExprは対象のteam_idを表すSQL式(プレースホルダ1個分)で、文中に
// 複数回(現状4回)現れる。D1は番号付きプレースホルダを使えないため、
// 呼び出し側はbindValueをその回数分だけ渡す。
//
// 所属クラスが0件になった編成は、名前を空にせず(team_name NOT NULLに違反する)
// 据え置く。空になった編成はteamCleanupで削除されるため、名前は見られない。
// 計算結果が今の名前と同じ場合は何もしない。無関係な更新のたびにteamの
// updated_atだけが進んでしまうのを防ぐため。
function recalculateTeamNameStatement(
  db: D1Database,
  teamIdExpr: string,
  bindValue: unknown
): D1PreparedStatement {
  const newNameExpr = `(
    SELECT GROUP_CONCAT(class_code, ' ') FROM (
      SELECT class_code FROM class_rooms
      WHERE team_id = ${teamIdExpr}
      ORDER BY class_room_id ASC
    )
  )`;
  return db
    .prepare(
      `UPDATE teams
         SET team_name = ${newNameExpr},
             updated_at = CURRENT_TIMESTAMP
       WHERE team_id = ${teamIdExpr}
         AND EXISTS (SELECT 1 FROM class_rooms WHERE team_id = ${teamIdExpr})
         AND team_name IS NOT ${newNameExpr}`
    )
    .bind(bindValue, bindValue, bindValue, bindValue);
}

export function buildRecalculateTeamNameStatement(
  db: D1Database,
  teamId: number
): D1PreparedStatement {
  return recalculateTeamNameStatement(db, '?', teamId);
}

// 対象クラスが所属するチームを、更新後のclass_rooms.team_idから逆引きして
// 名前を再計算する。呼び出し時点でteam_idが分からない(直前の同バッチの
// 更新で変わりうる)更新経路で使う。
export function buildRecalculateTeamNameForClassRoomStatement(
  db: D1Database,
  classRoomId: number
): D1PreparedStatement {
  return recalculateTeamNameStatement(
    db,
    '(SELECT team_id FROM class_rooms WHERE class_room_id = ?)',
    classRoomId
  );
}

// 対象チームを一時的な名前で逆引きして名前を再計算する。新規チームの
// team_idがまだJS側に戻ってきていない(同バッチ内で確定させたい)作成経路で使う。
export function buildRecalculateTeamNameByTeamNameStatement(
  db: D1Database,
  teamName: string
): D1PreparedStatement {
  return recalculateTeamNameStatement(
    db,
    '(SELECT team_id FROM teams WHERE team_name = ?)',
    teamName
  );
}
