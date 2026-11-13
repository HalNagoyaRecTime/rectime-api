import { env as workerEnv } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';
import { createReadCountingDb } from './readCountingDb';

const JWT_SECRET = 's'.repeat(32);
const EVENTS = 10;
const GATHERINGS = 192;
const TEAMS = 60;
const MAX_ROWS_READ_FOR_AUTH = 10;

const SEQ = (n: number) =>
  `WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < ${n - 1})`;

let studentToken: string;
let staffToken: string;
let teamIds: number[];

async function insertUser(name: string): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(name)
    .first<{ user_id: number }>();
  return row!.user_id;
}

function signToken(userId: number, clientType: 'mobile' | 'web') {
  return signAccessToken(
    {
      sub: String(userId),
      oid: `shared-${userId}`,
      email: `shared-${userId}@example.com`,
      display_name: 'shared',
      client_type: clientType,
    },
    JWT_SECRET,
    3600
  );
}

function request(
  path: string,
  clientType: 'mobile' | 'web',
  init: RequestInit = {}
) {
  const counting = createReadCountingDb();
  const testEnv: Env = {
    ...workerEnv,
    DB: counting.db,
    JWT_SECRET,
    ALLOWED_ORIGINS: 'http://localhost:8080',
  };
  const token = clientType === 'mobile' ? studentToken : staffToken;
  const response = app.fetch(
    new Request(`http://example.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Client-Type': clientType,
        'Content-Type': 'application/json',
      },
    }),
    testEnv
  );
  return { response, rowsRead: counting.rowsRead };
}

async function getJson(path: string, clientType: 'mobile' | 'web') {
  const { response, rowsRead } = request(path, clientType);
  const resolved = await response;
  expect(resolved.status).toBe(200);
  return { body: await resolved.json(), rowsRead: rowsRead() };
}

beforeAll(async () => {
  studentToken = await signToken(await insertUser('student'), 'mobile');
  const staffUserId = await insertUser('staff');
  await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
    .bind(staffUserId)
    .run();
  staffToken = await signToken(staffUserId, 'web');

  await workerEnv.DB.batch([
    workerEnv.DB.prepare(
      `${SEQ(10)} INSERT INTO venues (venue_name) SELECT 'shared-venue' || n FROM seq`
    ),
    workerEnv.DB.prepare(
      `INSERT INTO gathering_spots (gathering_spot_name) VALUES ('shared-spot')`
    ),
    workerEnv.DB.prepare(
      `${SEQ(EVENTS)} INSERT INTO events (event_name, start_time, end_time)
       SELECT 'shared-event' || n, printf('%02d00', 9 + n / 2), printf('%02d50', 9 + n / 2) FROM seq`
    ),
    workerEnv.DB.prepare(
      `${SEQ(EVENTS * 2)} INSERT INTO event_venues (event_id, venue_id)
       SELECT e.event_id, v.venue_id
       FROM seq
       JOIN events e ON e.event_name = 'shared-event' || (n / 2)
       JOIN venues v ON v.venue_name = 'shared-venue' || (n % 10)`
    ),
    workerEnv.DB.prepare(
      `${SEQ(GATHERINGS)} INSERT INTO gatherings (event_id, gathering_spot_id, gathering_time, round)
       SELECT e.event_id, s.gathering_spot_id, printf('%02d:%02d', 9 + n / 60, n % 60), n / ${EVENTS} + 1
       FROM seq
       JOIN events e ON e.event_name = 'shared-event' || (n % ${EVENTS})
       JOIN gathering_spots s ON s.gathering_spot_name = 'shared-spot'`
    ),
    workerEnv.DB.prepare(
      `${SEQ(TEAMS)} INSERT INTO teams (team_name) SELECT 'shared-team' || n FROM seq`
    ),
    workerEnv.DB.prepare(
      `INSERT INTO team_scores (team_id, scores)
       SELECT team_id, team_id % 7 FROM teams WHERE team_name LIKE 'shared-team%'`
    ),
  ]);
  const teams = await workerEnv.DB.prepare(
    "SELECT team_id FROM teams WHERE team_name LIKE 'shared-team%' ORDER BY team_id"
  ).all<{ team_id: number }>();
  teamIds = teams.results.map(row => row.team_id);
});

describe('mobile の競技一覧・ランキング', () => {
  it.each([
    '/api/v1/events?limit=100&offset=0',
    '/api/v1/ranking?limit=100&offset=0',
  ])('2回目の %s は D1 を読み直さずに同じ内容を返す', async path => {
    const first = await getJson(path, 'mobile');
    const second = await getJson(path, 'mobile');

    expect(first.rowsRead).toBeGreaterThan(MAX_ROWS_READ_FOR_AUTH * 3);
    expect(second.body).toEqual(first.body);
    expect(second.rowsRead).toBeLessThanOrEqual(MAX_ROWS_READ_FOR_AUTH);
  });
});

describe('スタッフ(web)の競技一覧', () => {
  it('mobile が使い回している間に競技を編集しても、web には編集後の内容を返す', async () => {
    const path = '/api/v1/events?limit=99&offset=0';
    await getJson(path, 'mobile');
    await workerEnv.DB.prepare(
      "UPDATE events SET event_name = 'shared-event-renamed' WHERE event_name = 'shared-event0'"
    ).run();

    const after = await getJson(path, 'web');
    expect(after.body).toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ event_name: 'shared-event-renamed' }),
      ]),
    });
  });
});

describe('スタッフ(web)のランキング', () => {
  it('mobile が使い回している間に得点を入れても、web には新しい得点を返す', async () => {
    const path = '/api/v1/ranking?limit=99&offset=0';
    const teamId = teamIds[0]!;
    await getJson(path, 'mobile');
    const before = await getJson(path, 'web');

    const added = await request(`/api/v1/teams/${teamId}/score`, 'web', {
      method: 'PATCH',
      body: JSON.stringify({ points: 1000 }),
    }).response;
    expect(added.status).toBe(200);

    const after = await getJson(path, 'web');
    expect(after.body).not.toEqual(before.body);
    expect(after.body).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ team_id: teamId, rank: 1 }),
      ]),
    });
  });
});
