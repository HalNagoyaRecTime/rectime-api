import { insertClassRoomWithTeam } from './fixtures/classRooms';
import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'c'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };

async function insertUser(name: string, isLiveActive = 1): Promise<number> {
  const user = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, ?) RETURNING user_id'
  )
    .bind(name, isLiveActive)
    .first<{ user_id: number }>();
  if (!user) throw new Error('API test Userを作成できませんでした');
  return user.user_id;
}

async function createToken(isStaff: boolean): Promise<string> {
  const userId = await insertUser('Notification Config API user');
  if (isStaff) {
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(userId)
      .run();
  }
  return signAccessToken(
    {
      sub: String(userId),
      oid: `notification-config-${userId}`,
      email: 'notification-config@example.com',
      display_name: 'Notification Config API user',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

function requestHeaders(token?: string): HeadersInit {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
    'X-Client-Type': 'web',
  };
}

async function getConfig(token?: string): Promise<Response> {
  return app.fetch(
    new Request('http://example.com/api/v1/admin/notifications/config', {
      method: 'GET',
      headers: requestHeaders(token),
    }),
    testEnv
  );
}

async function postAudienceCount(
  body: unknown,
  token?: string
): Promise<Response> {
  return app.fetch(
    new Request(
      'http://example.com/api/v1/admin/notifications/audience-count',
      {
        method: 'POST',
        headers: requestHeaders(token),
        body: JSON.stringify(body),
      }
    ),
    testEnv
  );
}

describe('通知config・audience-count API', () => {
  beforeEach(async () => {
    await workerEnv.DB.batch([
      workerEnv.DB.prepare('DELETE FROM notification_push_deliveries'),
      workerEnv.DB.prepare('DELETE FROM notification_recipients'),
      workerEnv.DB.prepare('DELETE FROM notification_audiences'),
      workerEnv.DB.prepare('DELETE FROM notification_schedules'),
      workerEnv.DB.prepare('DELETE FROM notifications'),
      workerEnv.DB.prepare('DELETE FROM firebase_tokens'),
      workerEnv.DB.prepare('DELETE FROM gathering_group_members'),
      workerEnv.DB.prepare('DELETE FROM gatherings'),
      workerEnv.DB.prepare('DELETE FROM gathering_spots'),
      workerEnv.DB.prepare('DELETE FROM students'),
      workerEnv.DB.prepare('DELETE FROM class_rooms'),
      workerEnv.DB.prepare('DELETE FROM team_scores'),
      workerEnv.DB.prepare('DELETE FROM teams'),
      workerEnv.DB.prepare('DELETE FROM staffs'),
      workerEnv.DB.prepare('DELETE FROM teachers'),
      workerEnv.DB.prepare('DELETE FROM events'),
      workerEnv.DB.prepare('DELETE FROM users'),
    ]);
  });

  describe('GET /admin/notifications/config', () => {
    it('Staffへ選択可能なimportanceだけを返し、highを含めない', async () => {
      const response = await getConfig(await createToken(true));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        importance: { default: 'normal', options: ['low', 'normal'] },
      });
    });

    it('未認証は401、Staff以外は403にする', async () => {
      expect((await getConfig()).status).toBe(401);
      expect((await getConfig(await createToken(false))).status).toBe(403);
    });
  });

  describe('POST /admin/notifications/audience-count', () => {
    it('Audience間で重複排除したactive User数を返し、Recipientを作成しない', async () => {
      const token = await createToken(true);
      const activeStudentId = await insertUser('Count active student');
      const inactiveStudentId = await insertUser('Count inactive student', 0);
      const classRoom = await insertClassRoomWithTeam(workerEnv.DB, {
        classCode: 'CA1',
        className: 'Config API 1組',
      });
      if (!classRoom)
        throw new Error('API test ClassRoomを作成できませんでした');
      await workerEnv.DB.batch([
        workerEnv.DB.prepare(
          `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
           VALUES (?, ?, 1, 'CA-S001')`
        ).bind(activeStudentId, classRoom.classRoomId),
        workerEnv.DB.prepare(
          `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
           VALUES (?, ?, 2, 'CA-S002')`
        ).bind(inactiveStudentId, classRoom.classRoomId),
      ]);

      const response = await postAudienceCount(
        {
          audience: {
            items: [
              { type: 'class_room', targetId: classRoom.classRoomId },
              { type: 'user', targetId: activeStudentId },
            ],
          },
        },
        token
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ recipientCount: 1 });
      const recipients = await workerEnv.DB.prepare(
        'SELECT COUNT(*) AS count FROM notification_recipients'
      ).first<{ count: number }>();
      expect(recipients?.count).toBe(0);
    });

    it('不正なAudienceは400、存在しない対象は404にする', async () => {
      const token = await createToken(true);

      const invalid = await postAudienceCount(
        { audience: { items: [{ type: 'unknown', targetId: 1 }] } },
        token
      );
      expect(invalid.status).toBe(400);

      const allWithOthers = await postAudienceCount(
        {
          audience: { items: [{ type: 'all' }, { type: 'user', targetId: 1 }] },
        },
        token
      );
      expect(allWithOthers.status).toBe(400);

      const missing = await postAudienceCount(
        { audience: { items: [{ type: 'event', targetId: 999_999 }] } },
        token
      );
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({
        error: { code: 'NOTIFICATION_AUDIENCE_NOT_FOUND' },
      });
    });

    it('未認証は401、Staff以外は403にする', async () => {
      const body = { audience: { items: [{ type: 'all' }] } };

      expect((await postAudienceCount(body)).status).toBe(401);
      expect(
        (await postAudienceCount(body, await createToken(false))).status
      ).toBe(403);
    });
  });
});
