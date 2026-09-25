import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 's'.repeat(32);
const testEnv: Env = {
  ...workerEnv,
  JWT_SECRET,
  ALLOWED_ORIGINS: 'http://localhost:8080',
};

let userIds: number[] = [];

afterEach(async () => {
  if (userIds.length > 0) {
    await workerEnv.DB.batch(
      userIds.flatMap(id => [
        workerEnv.DB.prepare('DELETE FROM staffs WHERE user_id = ?').bind(id),
        workerEnv.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(id),
      ])
    );
  }
  userIds = [];
});

async function insertUser(name: string): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(name)
    .first<{ user_id: number }>();
  userIds.push(row!.user_id);
  return row!.user_id;
}

// requireStaffはJWTではなくリクエストごとにstaffs行の有無で判定するため、
// トークンの中身ではなくDBの状態でstaffを作る必要がある。
async function insertStaffUser(): Promise<number> {
  const userId = await insertUser('PUT認可テストstaff');
  await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
    .bind(userId)
    .run();
  return userId;
}

async function putMembers(userId: number) {
  const token = await signAccessToken(
    {
      sub: String(userId),
      oid: `members-put-user-${userId}`,
      email: `members-put-user-${userId}@example.com`,
      display_name: 'PUT認可テスト',
      client_type: 'mobile',
    },
    JWT_SECRET,
    3600
  );
  // 集合やメンバーを用意せずに済むよう、認可を通過したかどうかだけが
  // ステータスの違いに表れる存在しない集合IDを使う。
  return app.fetch(
    new Request('http://example.com/api/v1/gatherings/999999/members', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Client-Type': 'mobile',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_ids: [] }),
    }),
    testEnv
  );
}

describe('PUT /api/v1/gatherings/:gatheringId/members の認可', () => {
  // 未認証の401はauthedでもstaffOnlyでも同じ結果になり区別できないため、
  // 認証済みの一般ユーザーで403になることを固定する。
  it('staffでないユーザーは403 STAFF_REQUIREDで拒否する', async () => {
    const userId = await insertUser('PUT認可テスト一般ユーザー');

    const res = await putMembers(userId);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { code: 'STAFF_REQUIRED' },
    });
  });

  // 403の検証だけでは「誰でも拒否する」壊れた認可でも通ってしまうため、
  // staffがControllerまで到達することも併せて固定する。
  it('staffは認可を通過してControllerまで到達する', async () => {
    const userId = await insertStaffUser();

    const res = await putMembers(userId);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: 'GATHERING_NOT_FOUND' },
    });
  });
});
