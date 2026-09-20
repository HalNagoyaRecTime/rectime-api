import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'e'.repeat(32);
const testEnv: Env = {
  ...workerEnv,
  JWT_SECRET,
  ALLOWED_ORIGINS: 'http://localhost:8080',
};

async function insertUser(): Promise<number> {
  const row = await workerEnv.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('集合テストユーザー') RETURNING user_id"
  ).first<{ user_id: number }>();
  return row!.user_id;
}

async function insertEvent(): Promise<number> {
  const row = await workerEnv.DB.prepare(
    "INSERT INTO events (event_name, rule_text, venue, start_time, end_time) VALUES ('リレー', 'バトンを使用します。', 'メインコート', '1100', '1230') RETURNING event_id"
  ).first<{ event_id: number }>();
  return row!.event_id;
}

async function insertSpot(name: string): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
  )
    .bind(name)
    .first<{ gathering_spot_id: number }>();
  return row!.gathering_spot_id;
}

async function insertGathering(
  eventId: number,
  spotId: number,
  round: number,
  time: string
): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO gatherings (event_id, gathering_spot_id, round, gathering_time) VALUES (?, ?, ?, ?) RETURNING gathering_id'
  )
    .bind(eventId, spotId, round, time)
    .first<{ gathering_id: number }>();
  return row!.gathering_id;
}

async function insertMember(gatheringId: number): Promise<void> {
  const row = await workerEnv.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('参加者') RETURNING user_id"
  ).first<{ user_id: number }>();
  await workerEnv.DB.prepare(
    'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
  )
    .bind(gatheringId, row!.user_id)
    .run();
}

async function fetchEventDetail(eventId: number, userId: number) {
  const token = await signAccessToken(
    {
      sub: String(userId),
      oid: `event-detail-user-${userId}`,
      email: `event-detail-user-${userId}@example.com`,
      display_name: '集合テストユーザー',
      client_type: 'mobile',
    },
    JWT_SECRET,
    3600
  );
  return app.fetch(
    new Request(`http://example.com/api/v1/events/${eventId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Client-Type': 'mobile',
      },
    }),
    testEnv
  );
}

describe('GET /api/v1/events/:eventId', () => {
  it('Event基本情報とRound単位の集合予定を1レスポンスで返す', async () => {
    const userId = await insertUser();
    const eventId = await insertEvent();
    const entrance1 = await insertSpot('出入口①');
    const entrance2 = await insertSpot('出入口②');

    // 挿入順とレスポンスの並び順が一致しないよう、あえてRoundを前後させる。
    const round2 = await insertGathering(eventId, entrance1, 2, '11:30');
    const round1Late = await insertGathering(eventId, entrance2, 1, '10:50');
    const round1Early = await insertGathering(eventId, entrance1, 1, '10:45');
    await insertMember(round1Early);
    await insertMember(round1Early);

    const response = await fetchEventDetail(eventId, userId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      event_id: eventId,
      event_name: 'リレー',
      rule_text: 'バトンを使用します。',
      venue: 'メインコート',
      start_time: '1100',
      end_time: '1230',
      rounds: [
        {
          round: 1,
          gatherings: [
            {
              gathering_id: round1Early,
              gathering_time: '10:45',
              gathering_spot: {
                gathering_spot_id: entrance1,
                gathering_spot_name: '出入口①',
              },
              member_count: 2,
            },
            {
              gathering_id: round1Late,
              gathering_time: '10:50',
              gathering_spot: {
                gathering_spot_id: entrance2,
                gathering_spot_name: '出入口②',
              },
              member_count: 0,
            },
          ],
        },
        {
          round: 2,
          gatherings: [
            {
              gathering_id: round2,
              gathering_time: '11:30',
              gathering_spot: {
                gathering_spot_id: entrance1,
                gathering_spot_name: '出入口①',
              },
              member_count: 0,
            },
          ],
        },
      ],
      created_at: expect.any(String),
      updated_at: expect.any(String),
    });
  });

  it('集合予定が無いEventはroundsを空配列で返す', async () => {
    const userId = await insertUser();
    const eventId = await insertEvent();

    const response = await fetchEventDetail(eventId, userId);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      event_id: eventId,
      rounds: [],
    });
  });
});
