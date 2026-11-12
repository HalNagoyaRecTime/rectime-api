import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { TeamDTO } from '../src/application/dto/RankingDTO';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 't'.repeat(32);
const testEnv: Env = { ...env, JWT_SECRET };

describe('チーム削除API', () => {
  let headers: Record<string, string>;
  let teamId: number;
  let classRoomIds: number[];

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM students').run();
    await env.DB.prepare('DELETE FROM class_rooms').run();
    await env.DB.prepare('DELETE FROM team_scores').run();
    await env.DB.prepare('DELETE FROM teams').run();
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('チーム削除テスト担当者') RETURNING user_id"
    ).first<{ user_id: number }>();
    const userId = user!.user_id;
    await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(userId)
      .run();
    const token = await signAccessToken(
      {
        sub: String(userId),
        oid: `team-delete-${userId}`,
        email: 'team-delete@example.com',
        display_name: 'チーム削除テスト担当者',
        client_type: 'web',
      },
      JWT_SECRET,
      3600
    );
    headers = { Authorization: `Bearer ${token}`, 'X-Client-Type': 'web' };

    const team = await env.DB.prepare(
      "INSERT INTO teams (team_name) VALUES ('合同チーム') RETURNING team_id"
    ).first<{ team_id: number }>();
    teamId = team!.team_id;
    const classes = await env.DB.prepare(
      `INSERT INTO class_rooms (class_code, class_name, team_id)
       VALUES ('1A', 'Aクラス', ?), ('1B', 'Bクラス', ?) RETURNING class_room_id`
    )
      .bind(teamId, teamId)
      .all<{ class_room_id: number }>();
    classRoomIds = classes.results.map(row => row.class_room_id);
  });

  function request(path: string, method = 'GET') {
    return app.fetch(
      new Request(`http://example.com/api/v1${path}`, { method, headers }),
      testEnv
    );
  }

  async function listTeams() {
    const response = await request('/teams');
    expect(response.status).toBe(200);
    return response.json() as Promise<{ total: number; items: TeamDTO[] }>;
  }

  it('複数クラスの0点チームを削除し、クラス・学生を保持して一覧を再取得できる', async () => {
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('所属学生') RETURNING user_id"
    ).first<{ user_id: number }>();
    await env.DB.prepare(
      `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, 1, 'team-delete-student')`
    )
      .bind(user!.user_id, classRoomIds[0])
      .run();
    const studentBefore = await env.DB.prepare('SELECT * FROM students').all();
    await env.DB.prepare(
      'INSERT INTO team_scores (team_id, scores) VALUES (?, 0)'
    )
      .bind(teamId)
      .run();
    expect((await listTeams()).total).toBe(1);

    const response = await request(`/teams/${teamId}`, 'DELETE');

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect((await request(`/teams/${teamId}`)).status).toBe(404);
    const after = await listTeams();
    expect(after.total).toBe(2);
    expect(after.items).toEqual([
      expect.objectContaining({
        team_name: '1A',
        registered_classes: ['1A'],
        scores: 0,
      }),
      expect.objectContaining({
        team_name: '1B',
        registered_classes: ['1B'],
        scores: 0,
      }),
    ]);
    expect(after.items.every(team => team.team_id !== teamId)).toBe(true);
    const classes = await env.DB.prepare(
      'SELECT class_room_id FROM class_rooms ORDER BY class_room_id'
    ).all<{ class_room_id: number }>();
    expect(classes.results.map(row => row.class_room_id)).toEqual(classRoomIds);
    expect(
      (await env.DB.prepare('SELECT * FROM students').all()).results
    ).toEqual(studentBefore.results);
  });

  it('得点が残る場合は409と具体的な理由を返し、一覧と所属を変えない', async () => {
    await env.DB.prepare(
      'INSERT INTO team_scores (team_id, scores) VALUES (?, 10)'
    )
      .bind(teamId)
      .run();
    const before = await listTeams();

    const response = await request(`/teams/${teamId}`, 'DELETE');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'TEAM_HAS_SCORES',
        message: 'チームに得点が登録されているため削除できません',
      },
    });
    expect(await listTeams()).toEqual(before);
  });

  it('単独編成名の競合は409と具体的な理由を返し、変更を残さない', async () => {
    await env.DB.prepare("INSERT INTO teams (team_name) VALUES ('1B')").run();
    const before = await listTeams();

    const response = await request(`/teams/${teamId}`, 'DELETE');

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'TEAM_DETACH_NAME_CONFLICT',
        message: '単独編成へ戻すチーム名が既に使われているため削除できません',
      },
    });
    expect(await listTeams()).toEqual(before);
  });
});
