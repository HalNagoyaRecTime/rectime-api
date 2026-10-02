import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import {
  clearNotificationFixtures,
  createDeliveryFixture,
} from './notificationDeliveryFixtures';
const secret = 's'.repeat(32);
async function request(userId: number | null, id: string) {
  const token =
    userId === null
      ? null
      : await signAccessToken(
          {
            sub: String(userId),
            oid: '通知停止テスト',
            email: 'stop@example.com',
            display_name: '停止テスト',
            client_type: 'web',
          },
          secret,
          3600
        );
  return app.fetch(
    new Request(
      `http://example.com/api/v1/admin/notifications/schedules/${id}/stop`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    ),
    { ...env, JWT_SECRET: secret }
  );
}
describe('通知停止APIの認可・実DI・D1統合', () => {
  beforeEach(clearNotificationFixtures);
  it('未認証401・非staff403・不正ID400・不在404と実Stop成功200・重複409', async () => {
    const f = await createDeliveryFixture();
    expect((await request(null, String(f.scheduleId))).status).toBe(401);
    expect((await request(f.userId, String(f.scheduleId))).status).toBe(403);
    await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(f.userId)
      .run();
    expect((await request(f.userId, '不正')).status).toBe(400);
    expect((await request(f.userId, '999999')).status).toBe(404);
    const success = await request(f.userId, String(f.scheduleId));
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({
      notificationScheduleId: f.scheduleId,
      status: 'stopped',
    });
    expect((await request(f.userId, String(f.scheduleId))).status).toBe(409);
  });
});
