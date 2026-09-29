import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'r'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };
let userIds: number[] = [];

async function createStaffToken(): Promise<string> {
  const user = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(`OpenAPI runtime validation staff ${crypto.randomUUID()}`)
    .first<{ user_id: number }>();
  if (!user) throw new Error('実ルート検証用staffを作成できませんでした');

  userIds.push(user.user_id);
  await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
    .bind(user.user_id)
    .run();

  return signAccessToken(
    {
      sub: String(user.user_id),
      oid: `openapi-runtime-validation-${user.user_id}`,
      email: `openapi-runtime-validation-${user.user_id}@example.com`,
      display_name: '実ルート検証staff',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

async function requestAsStaff(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Client-Type', 'web');

  return app.fetch(
    new Request(`http://example.com${path}`, { ...init, headers }),
    testEnv
  );
}

afterEach(async () => {
  if (userIds.length > 0) {
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

describe('OpenAPIHono実ルートのvalidation契約', () => {
  it('Eventの時刻範囲エラーはINVALID_EVENT_REQUESTを返す', async () => {
    const token = await createStaffToken();

    const response = await requestAsStaff(token, '/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: '徒競走',
        rule_text: null,
        venue_ids: [1],
        start_time: '1000',
        end_time: '0900',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_EVENT_REQUEST' },
    });
  });

  it('Eventの一般schemaエラーはVALIDATION_ERRORを返す', async () => {
    const token = await createStaffToken();

    const response = await requestAsStaff(token, '/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: '',
        rule_text: null,
        venue_ids: [1],
        start_time: '1000',
        end_time: '1100',
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it.each([
    ['/api/v1/venues?limit=0', 'INVALID_VENUE_LIST_QUERY'],
    ['/api/v1/gathering-spots?limit=0', 'INVALID_GATHERING_SPOT_LIST_QUERY'],
  ] as const)(
    '%sはendpoint固有のvalidation errorを返す',
    async (path, code) => {
      const token = await createStaffToken();

      const response = await requestAsStaff(token, path);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code } });
    }
  );

  it('safe integerを超えるEvent IDは丸めずINVALID_EVENT_IDを返す', async () => {
    const token = await createStaffToken();

    const response = await requestAsStaff(
      token,
      '/api/v1/events/9007199254740992'
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_EVENT_ID' },
    });
  });
});
