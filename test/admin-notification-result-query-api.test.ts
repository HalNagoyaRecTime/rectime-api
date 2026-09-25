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
      oid: 'result-query-user-' + userId,
      email: 'result-query-user-' + userId + '@example.com',
      display_name: 'Result query test',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
  return app.fetch(
    new Request('http://example.com' + path, {
      headers: { Authorization: 'Bearer ' + token },
    }),
    testEnv
  );
}

describe('管理用Recipient Results・Push Delivery Detail APIの認可', () => {
  it('2 endpointとも未認証アクセスを401で拒否する', async () => {
    for (const path of [
      '/api/v1/admin/notifications/schedules/1/results',
      '/api/v1/admin/notifications/push-deliveries/1',
    ]) {
      const response = await app.fetch(
        new Request('http://example.com' + path),
        testEnv
      );
      expect(response.status).toBe(401);
    }
  });

  it('staff以外は403となり、staffはScheduleとDeliveryの404を返す', async () => {
    const userId = await insertUser('結果照会一般ユーザー');
    const staffId = await insertUser('結果照会staff', true);
    const resultsPath = '/api/v1/admin/notifications/schedules/999999/results';
    const deliveryPath = '/api/v1/admin/notifications/push-deliveries/999999';

    expect((await requestAs(userId, resultsPath)).status).toBe(403);
    expect((await requestAs(userId, deliveryPath)).status).toBe(403);

    const missingSchedule = await requestAs(staffId, resultsPath);
    expect(missingSchedule.status).toBe(404);
    expect(await missingSchedule.json()).toMatchObject({
      error: { code: 'NOTIFICATION_SCHEDULE_NOT_FOUND' },
    });

    const missingDelivery = await requestAs(staffId, deliveryPath);
    expect(missingDelivery.status).toBe(404);
    expect(await missingDelivery.json()).toMatchObject({
      error: { code: 'NOTIFICATION_PUSH_DELIVERY_NOT_FOUND' },
    });
  });

  it('pageとlimitが範囲外なら400を返す', async () => {
    const staffId = await insertUser('結果照会pagination staff', true);
    const response = await requestAs(
      staffId,
      '/api/v1/admin/notifications/schedules/1/results?page=0&limit=101'
    );
    expect(response.status).toBe(400);
  });
});
