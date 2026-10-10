import { createAdminNotificationCommandRepository } from '../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { NOTIFICATION_AUDIENCE_USER_DELETED_REASON } from '../src/domain/entities/NotificationAudienceResolver';
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
  it.each(['failed', 'scheduled', 'stopped'] as const)(
    '%sの失敗理由を一覧・詳細APIで返し、停止理由と区別する',
    async status => {
      const staffId = await insertUser('失敗理由を確認するスタッフ', true);
      const created = await createAdminNotificationCommandRepository(
        workerEnv.DB
      ).create({
        actor_user_id: staffId,
        push_title: '対象消失テスト',
        push_body: '本文',
        detail_title: '詳細',
        detail_body: '本文',
        importance: 'normal',
        audiences: [{ type: 'user', target_id: staffId }],
        send_at: '2026-10-03T00:00:00.000Z',
        now: '2026-10-03T00:00:00.000Z',
      });
      const id = created.notification_schedule_id;
      try {
        await workerEnv.DB.prepare(
          'UPDATE notification_schedules SET send_status = ?, reason = ?, stopped_at = ? WHERE notification_schedule_id = ?'
        )
          .bind(
            status,
            status === 'stopped'
              ? 'manual'
              : NOTIFICATION_AUDIENCE_USER_DELETED_REASON,
            status === 'stopped' ? '2026-10-03T00:00:00.000Z' : null,
            id
          )
          .run();
        const detail = await requestAs(
          staffId,
          `/api/v1/admin/notifications/schedules/${id}`
        );
        expect(detail.status).toBe(200);
        expect(await detail.json()).toMatchObject({
          status,
          failureReason:
            status === 'failed'
              ? NOTIFICATION_AUDIENCE_USER_DELETED_REASON
              : null,
          stop: status === 'stopped' ? { reason: 'manual' } : null,
        });
        const list = await requestAs(
          staffId,
          '/api/v1/admin/notifications/schedules?from=2026-10-03T00%3A00%3A00Z&to=2026-10-03T23%3A59%3A59Z'
        );
        expect(list.status).toBe(200);
        expect(await list.json()).toMatchObject({
          items: expect.arrayContaining([
            expect.objectContaining({
              notificationScheduleId: id,
              status,
              failureReason:
                status === 'failed'
                  ? NOTIFICATION_AUDIENCE_USER_DELETED_REASON
                  : null,
            }),
          ]),
        });
      } finally {
        await workerEnv.DB.prepare(
          'DELETE FROM notification_audiences WHERE notification_schedule_id = ?'
        )
          .bind(id)
          .run();
        await workerEnv.DB.prepare(
          'DELETE FROM notification_schedules WHERE notification_schedule_id = ?'
        )
          .bind(id)
          .run();
        await workerEnv.DB.prepare(
          'DELETE FROM notifications WHERE notification_id = ?'
        )
          .bind(created.notification_id)
          .run();
      }
    }
  );

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
