import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 's'.repeat(32);
const testEnv: Env = {
  ...workerEnv,
  JWT_SECRET,
  ALLOWED_ORIGINS: 'http://localhost:8080',
};

let userIds: number[] = [];
let gatheringId: number | null = null;
let eventId: number | null = null;
let spotId: number | null = null;

afterEach(async () => {
  const db = workerEnv.DB;
  if (gatheringId !== null) {
    await db.batch([
      db
        .prepare('DELETE FROM gathering_group_members WHERE gathering_id = ?')
        .bind(gatheringId),
      db
        .prepare('DELETE FROM gatherings WHERE gathering_id = ?')
        .bind(gatheringId),
    ]);
  }
  if (eventId !== null) {
    await db
      .prepare('DELETE FROM events WHERE event_id = ?')
      .bind(eventId)
      .run();
  }
  if (spotId !== null) {
    await db
      .prepare('DELETE FROM gathering_spots WHERE gathering_spot_id = ?')
      .bind(spotId)
      .run();
  }
  if (userIds.length > 0) {
    await db.batch(
      userIds.flatMap(id => [
        db.prepare('DELETE FROM staffs WHERE user_id = ?').bind(id),
        db.prepare('DELETE FROM users WHERE user_id = ?').bind(id),
      ])
    );
  }
  userIds = [];
  gatheringId = eventId = spotId = null;
});

async function setupGathering() {
  const db = workerEnv.DB;
  const spot = await db
    .prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
    .bind('全生徒PUTテスト場所')
    .first<{ gathering_spot_id: number }>();
  spotId = spot!.gathering_spot_id;
  const event = await db
    .prepare(
      'INSERT INTO events (event_name, start_time, end_time) VALUES (?, ?, ?) RETURNING event_id'
    )
    .bind('全生徒PUTテスト競技', '0900', '1000')
    .first<{ event_id: number }>();
  eventId = event!.event_id;
  const gathering = await db
    .prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id, gathering_time, round) VALUES (?, ?, ?, ?) RETURNING gathering_id'
    )
    .bind(eventId, spotId, '08:50', 1)
    .first<{ gathering_id: number }>();
  gatheringId = gathering!.gathering_id;
  return gatheringId;
}

async function createUsers(count: number) {
  const created = await workerEnv.DB.batch(
    Array.from({ length: count }, (_, i) =>
      workerEnv.DB.prepare(
        'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
      ).bind(`全生徒PUTテストユーザー${i}`)
    )
  );
  const ids = created.map(
    result => (result.results[0] as { user_id: number }).user_id
  );
  userIds.push(...ids);
  return ids;
}

async function staffToken() {
  const [staffUserId] = await createUsers(1);
  await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
    .bind(staffUserId)
    .run();
  return signAccessToken(
    {
      sub: String(staffUserId),
      oid: `members-large-staff-${staffUserId}`,
      email: `members-large-staff-${staffUserId}@example.com`,
      display_name: '全生徒PUTテストstaff',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

function request(token: string, method: string, path: string, body?: unknown) {
  return app.fetch(
    new Request(`http://example.com/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Client-Type': 'web',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv
  );
}

describe('PUT /api/v1/gatherings/:gatheringId/members の人数', () => {
  it('staffが当日の全生徒(2,148人)を1つの集合に登録でき、GETで全員が返る', async () => {
    const token = await staffToken();
    const id = await setupGathering();
    const studentUserIds = await createUsers(2148);

    const put = await request(token, 'PUT', `/gatherings/${id}/members`, {
      user_ids: studentUserIds,
    });
    const get = await request(token, 'GET', `/gatherings/${id}/members`);

    expect(put.status).toBe(200);
    expect(get.status).toBe(200);
    const members = (await get.json()) as { user_id: number }[];
    expect(members.map(m => m.user_id).sort((a, b) => a - b)).toEqual(
      [...studentUserIds].sort((a, b) => a - b)
    );
  });
});
