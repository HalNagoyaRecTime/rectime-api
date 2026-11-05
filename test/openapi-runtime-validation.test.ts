import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'r'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };
let userIds: number[] = [];
let eventIds: number[] = [];
let venueIds: number[] = [];

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
  if (eventIds.length > 0) {
    await workerEnv.DB.batch(
      eventIds.map(eventId =>
        workerEnv.DB.prepare('DELETE FROM events WHERE event_id = ?').bind(
          eventId
        )
      )
    );
  }
  if (venueIds.length > 0) {
    await workerEnv.DB.batch(
      venueIds.map(venueId =>
        workerEnv.DB.prepare('DELETE FROM venues WHERE venue_id = ?').bind(
          venueId
        )
      )
    );
  }
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
  eventIds = [];
  venueIds = [];
});

describe('OpenAPIHono実ルートのvalidation契約', () => {
  it('同一時刻の出席締切を作成・更新し、その時刻のまま取得できる', async () => {
    const token = await createStaffToken();
    const venue = await workerEnv.DB.prepare(
      'INSERT INTO venues (venue_name) VALUES (?) RETURNING venue_id'
    )
      .bind(`締切テスト会場 ${crypto.randomUUID()}`)
      .first<{ venue_id: number }>();
    if (!venue) throw new Error('締切検証用の会場を作成できませんでした');
    venueIds.push(venue.venue_id);
    const deadline = {
      event_name: '出席確認',
      rule_text: '出席確認の締切時刻です。',
      venue_ids: [venue.venue_id],
      start_time: '0910',
      end_time: '0910',
    };

    const createdResponse = await requestAsStaff(token, '/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deadline),
    });
    const created = (await createdResponse.json()) as { event_id: number };
    if (created.event_id) eventIds.push(created.event_id);
    expect(createdResponse.status).toBe(201);
    expect(created).toMatchObject({
      event_name: '出席確認',
      start_time: '0910',
      end_time: '0910',
    });

    const updatedDeadline = {
      ...deadline,
      start_time: '0920',
      end_time: '0920',
    };
    const updatedResponse = await requestAsStaff(
      token,
      `/api/v1/events/${created.event_id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDeadline),
      }
    );
    expect(updatedResponse.status).toBe(200);
    expect(await updatedResponse.json()).toMatchObject({
      event_id: created.event_id,
      start_time: '0920',
      end_time: '0920',
    });

    const detailResponse = await requestAsStaff(
      token,
      `/api/v1/events/${created.event_id}`
    );
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toMatchObject({
      event_id: created.event_id,
      event_name: '出席確認',
      start_time: '0920',
      end_time: '0920',
      rounds: [],
    });
  });

  it.each([
    ['POST', '/api/v1/events'],
    ['PUT', '/api/v1/events/1'],
  ])(
    '%s Eventの逆転した時刻はINVALID_EVENT_REQUESTを返す',
    async (method, path) => {
      const token = await createStaffToken();

      const response = await requestAsStaff(token, path, {
        method,
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
    }
  );

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
