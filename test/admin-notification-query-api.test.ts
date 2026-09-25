import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'admin-notification-query-test-secret';
const testEnv: Env = { ...workerEnv, JWT_SECRET };
let userIds: number[] = [];

afterEach(async () => {
  if (userIds.length) {
    await workerEnv.DB.batch(
      userIds.flatMap(userId => [
        workerEnv.DB.prepare('DELETE FROM staffs WHERE user_id = ?').bind(
          userId
        ),
        workerEnv.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(
          userId
        ),
      ])
    );
  }
  userIds = [];
});

async function createUser(name: string, isStaff = false): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(name)
    .first<{ user_id: number }>();
  if (!row) throw new Error('認可テストUserを作成できませんでした');
  userIds.push(row.user_id);
  if (isStaff) {
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(row.user_id)
      .run();
  }
  return row.user_id;
}

async function request(userId: number, path: string): Promise<Response> {
  const token = await signAccessToken(
    {
      sub: String(userId),
      oid: `admin-notification-query-${userId}`,
      email: `notification-query-${userId}@example.com`,
      display_name: '通知Query認可テスト',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
  return app.fetch(
    new Request(`http://example.com/api/v1/admin/notifications${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    testEnv
  );
}

describe('Admin Notification Query API authorization', () => {
  it('一般ユーザーは403 STAFF_REQUIREDで拒否する', async () => {
    const userId = await createUser('通知Query一般ユーザー');

    const response = await request(userId, '');

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'STAFF_REQUIRED' },
    });
  });

  it('staffはControllerまで到達し、存在しない通知は404になる', async () => {
    const userId = await createUser('通知Query staff', true);

    const response = await request(userId, '/999999');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'ADMIN_NOTIFICATION_NOT_FOUND' },
    });
  });

  it('staff一覧の片側だけの期間指定は400 VALIDATION_ERROR', async () => {
    const userId = await createUser('通知Query期間テストstaff', true);

    const response = await request(userId, '?from=2026-07-23T00%3A00%3A00Z');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});
