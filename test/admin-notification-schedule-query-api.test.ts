import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 's'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };
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

async function insertUser(name: string, staff = false): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(name)
    .first<{ user_id: number }>();
  if (!row) throw new Error('ユーザーを作成できませんでした');
  userIds.push(row.user_id);
  if (staff) {
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(row.user_id)
      .run();
  }
  return row.user_id;
}

async function requestAs(userId: number, path: string): Promise<Response> {
  const token = await signAccessToken(
    {
      sub: String(userId),
      oid: `schedule-query-user-${userId}`,
      email: `schedule-query-user-${userId}@example.com`,
      display_name: 'Schedule query test',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
  return app.fetch(
    new Request(`http://example.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    testEnv
  );
}

describe('管理用通知スケジュール照会APIの認可と入力検証', () => {
  it('未認証アクセスを401で拒否する', async () => {
    const response = await app.fetch(
      new Request('http://example.com/api/v1/admin/notifications/schedules'),
      testEnv
    );
    expect(response.status).toBe(401);
  });

  it('非staffのSchedule一覧を403とし、staffのScheduleと数値Notification IDを処理する', async () => {
    const userId = await insertUser('通知schedule照会一般ユーザー');
    const staffId = await insertUser('通知schedule照会staff', true);

    const forbidden = await requestAs(
      userId,
      '/api/v1/admin/notifications/schedules'
    );
    expect(forbidden.status).toBe(403);

    const list = await requestAs(
      staffId,
      '/api/v1/admin/notifications/schedules'
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ items: expect.any(Array) });

    const missing = await requestAs(
      staffId,
      '/api/v1/admin/notifications/schedules/999999'
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: 'NOTIFICATION_SCHEDULE_NOT_FOUND' },
    });

    const missingNotification = await requestAs(
      staffId,
      '/api/v1/admin/notifications/999999'
    );
    expect(missingNotification.status).toBe(404);
    expect(await missingNotification.json()).toMatchObject({
      error: { code: 'ADMIN_NOTIFICATION_NOT_FOUND' },
    });
  });

  it('fromまたはtoの片方だけでは400を返す', async () => {
    const staffId = await insertUser('通知schedule照会filter staff', true);
    const response = await requestAs(
      staffId,
      '/api/v1/admin/notifications/schedules?from=2026-07-23T00:00:00Z'
    );
    expect(response.status).toBe(400);
  });
});
