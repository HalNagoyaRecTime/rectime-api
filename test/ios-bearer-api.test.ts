import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'i'.repeat(32);
const testEnv: Env = {
  ...workerEnv,
  JWT_SECRET,
  ALLOWED_ORIGINS: 'http://localhost:8080',
};

async function createMobileAccessToken(
  userId: number,
  expiresInSeconds = 3600
): Promise<string> {
  return signAccessToken(
    {
      sub: String(userId),
      oid: `ios-user-${userId}`,
      email: `ios-user-${userId}@example.com`,
      display_name: 'iOSテストユーザー',
      client_type: 'mobile',
    },
    JWT_SECRET,
    expiresInSeconds
  );
}

function mobileHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'X-Client-Type': 'mobile',
  };
}

describe('iOS Bearer authentication API flow', () => {
  it('mobile用Bearer Tokenでauth/meと既存イベントAPIを利用できる', async () => {
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('iOSテストユーザー') RETURNING user_id"
    ).first<{ user_id: number }>();
    const event = await workerEnv.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('リレー', 'グラウンド', '1030', '1100') RETURNING event_id"
    ).first<{ event_id: number }>();
    const token = await createMobileAccessToken(user!.user_id);
    const headers = mobileHeaders(token);

    const meResponse = await app.fetch(
      new Request('http://example.com/api/v1/auth/me', { headers }),
      testEnv
    );
    const eventsResponse = await app.fetch(
      new Request('http://example.com/api/v1/events', { headers }),
      testEnv
    );
    const eventResponse = await app.fetch(
      new Request(`http://example.com/api/v1/events/${event!.event_id}`, {
        headers,
      }),
      testEnv
    );

    expect(meResponse.status).toBe(200);
    expect(await meResponse.json()).toMatchObject({
      user: {
        id: String(user!.user_id),
        email: `ios-user-${user!.user_id}@example.com`,
        display_name: 'iOSテストユーザー',
      },
    });
    expect(eventsResponse.status).toBe(200);
    const eventsBody = (await eventsResponse.json()) as {
      events: Array<{ event_id: number; event_name: string }>;
    };
    expect(eventsBody.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_id: event!.event_id,
          event_name: 'リレー',
        }),
      ])
    );
    expect(eventResponse.status).toBe(200);
    expect(await eventResponse.json()).toMatchObject({
      event_id: event!.event_id,
      event_name: 'リレー',
      venue: 'グラウンド',
      start_time: '1030',
      end_time: '1100',
    });
  });

  it('mobile用TokenでX-Client-Typeが無い場合は401を返す', async () => {
    const token = await createMobileAccessToken(1);

    const response = await app.fetch(
      new Request('http://example.com/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      testEnv
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'INVALID_TOKEN', message: 'トークンが不正です。' },
    });
  });

  it('期限切れのmobile用TokenはSESSION_EXPIREDとして401を返す', async () => {
    const token = await createMobileAccessToken(1, -1);

    const response = await app.fetch(
      new Request('http://example.com/api/v1/auth/me', {
        headers: mobileHeaders(token),
      }),
      testEnv
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: 'SESSION_EXPIRED',
        message: 'セッションの有効期限が切れました。',
      },
    });
  });

  it('不正なBearer Tokenは401を返しTokenをレスポンスへ含めない', async () => {
    const invalidToken = 'invalid-ios-access-token';

    const response = await app.fetch(
      new Request('http://example.com/api/v1/auth/me', {
        headers: mobileHeaders(invalidToken),
      }),
      testEnv
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: { code: 'INVALID_TOKEN', message: 'トークンが不正です。' },
    });
    expect(JSON.stringify(body)).not.toContain(invalidToken);
  });
});
