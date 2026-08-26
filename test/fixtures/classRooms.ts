import type { D1Database } from '@cloudflare/workers-types';

// class_rooms.team_id は NOT NULL で teams(team_id) を参照するため、
// class_rooms を作るテストは必ず対応する team も作る必要がある。
// テストごとに毎回チーム作成SQLを書かずに済むよう共通化する。
export async function insertClassRoomWithTeam(
  db: D1Database,
  params: {
    classCode: string;
    className: string;
    classRoomId?: number;
    teacherId?: number | null;
  }
): Promise<{ classRoomId: number; teamId: number }> {
  const team = await db
    .prepare('INSERT INTO teams (team_name) VALUES (?) RETURNING team_id')
    .bind(params.className)
    .first<{ team_id: number }>();
  if (!team) throw new Error('Failed to create team for test class room');

  const columns = ['class_code', 'class_name', 'team_id'];
  const values: unknown[] = [params.classCode, params.className, team.team_id];
  if (params.classRoomId !== undefined) {
    columns.unshift('class_room_id');
    values.unshift(params.classRoomId);
  }
  if (params.teacherId !== undefined) {
    columns.push('teacher_id');
    values.push(params.teacherId);
  }

  const placeholders = columns.map(() => '?').join(', ');
  const classRoom = await db
    .prepare(
      `INSERT INTO class_rooms (${columns.join(', ')}) VALUES (${placeholders}) RETURNING class_room_id`
    )
    .bind(...values)
    .first<{ class_room_id: number }>();
  if (!classRoom) throw new Error('Failed to create test class room');

  return { classRoomId: classRoom.class_room_id, teamId: team.team_id };
}
