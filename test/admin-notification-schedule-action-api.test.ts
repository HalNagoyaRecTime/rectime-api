import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import {
  clearNotificationFixtures,
  createDeliveryFixture,
} from './notificationDeliveryFixtures';
const secret = 'a'.repeat(32);
const immediate = { delivery: { type: 'immediate', sendAt: null } };
async function request(
  userId: number | null,
  id: string,
  method = 'POST',
  body: unknown = immediate
) {
  const token =
    userId === null
      ? null
      : await signAccessToken(
          {
            sub: String(userId),
            oid: 'schedule-action-test',
            email: 'schedule-action@example.com',
            display_name: '通知操作テスト',
            client_type: 'web',
          },
          secret,
          3600
        );
  return app.fetch(
    new Request(
      `http://example.com/api/v1/admin/notifications/schedules/${id}${method === 'POST' ? '/resend' : ''}`,
      {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      }
    ),
    { ...env, JWT_SECRET: secret }
  );
}
describe('Schedule再送・取消APIの実DI統合', () => {
  beforeEach(clearNotificationFixtures);
  it('再送と取消は未認証401・非staff403・不正ID400・不在404を返す', async () => {
    const f = await createDeliveryFixture();
    for (const method of ['POST', 'DELETE']) {
      expect((await request(null, String(f.scheduleId), method)).status).toBe(
        401
      );
      expect(
        (await request(f.userId, String(f.scheduleId), method)).status
      ).toBe(403);
    }
    await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(f.userId)
      .run();
    for (const method of ['POST', 'DELETE']) {
      expect((await request(f.userId, '不正', method)).status).toBe(400);
      expect((await request(f.userId, '999999', method)).status).toBe(404);
    }
    expect(
      (await request(f.userId, String(f.scheduleId), 'POST', {})).status
    ).toBe(400);
    expect(
      (
        await request(f.userId, String(f.scheduleId), 'POST', {
          delivery: { type: 'scheduled', sendAt: '不正' },
        })
      ).status
    ).toBe(400);
  });
  it('sendingから即時・予約の新Scheduleを作り、未開始の取消は204・開始済みは409になる', async () => {
    const f = await createDeliveryFixture();
    await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(f.userId)
      .run();
    const response = await request(f.userId, String(f.scheduleId));
    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      notificationId: number;
      notificationScheduleId: number;
    };
    expect(created).toEqual({
      notificationId: f.notificationId,
      notificationScheduleId: expect.any(Number),
    });
    expect(created.notificationScheduleId).not.toBe(f.scheduleId);
    expect(
      await env.DB.prepare(
        'SELECT scheduled_by_user_id,send_status,started_at FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(created.notificationScheduleId)
        .first()
    ).toEqual({
      scheduled_by_user_id: f.userId,
      send_status: 'scheduled',
      started_at: null,
    });
    expect(
      (await request(f.userId, String(f.scheduleId), 'DELETE')).status
    ).toBe(409);
    const cancel = await request(
      f.userId,
      String(created.notificationScheduleId),
      'DELETE'
    );
    expect(cancel.status).toBe(204);
    expect(await cancel.text()).toBe('');
    expect(
      (
        await request(
          f.userId,
          String(created.notificationScheduleId),
          'DELETE'
        )
      ).status
    ).toBe(404);
    const scheduled = await request(f.userId, String(f.scheduleId), 'POST', {
      delivery: { type: 'scheduled', sendAt: '2026-11-07T15:47:00+09:00' },
    });
    expect(scheduled.status).toBe(201);
    const scheduledResult = (await scheduled.json()) as {
      notificationScheduleId: number;
    };
    expect(
      await env.DB.prepare(
        'SELECT send_at FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(scheduledResult.notificationScheduleId)
        .first()
    ).toEqual({ send_at: '2026-11-07T06:47:00.000Z' });
  });
  it('削除されたautomatic sourceの再送を共通409で拒否する', async () => {
    const f = await createDeliveryFixture();
    await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(f.userId)
      .run();
    await env.DB.prepare(
      "UPDATE notifications SET source_type='gathering',source_id=999999,source_hash='action-test-source' WHERE notification_id = ?"
    )
      .bind(f.notificationId)
      .run();
    const response = await request(f.userId, String(f.scheduleId));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOTIFICATION_RESEND_NOT_ALLOWED' },
    });
  });
});
