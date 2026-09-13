import { env } from 'cloudflare:workers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';

const JWT_SECRET = 'g'.repeat(32);
const testEnv = { ...env, JWT_SECRET };
let eventId: number;
let emptyEventId: number;
let spotId: number;
let gatheringId: number;
let headers: Record<string, string>;

function request(event: number | string, authHeaders = headers) {
  return app.fetch(
    new Request(`http://example.com/api/v1/events/${event}/gatherings`, {
      headers: authHeaders,
    }),
    testEnv
  );
}

beforeAll(async () => {
  const token = await signAccessToken(
    {
      sub: '1',
      oid: 'legacy-mobile-test',
      email: 'legacy-mobile@example.com',
      display_name: '互換テスト',
      client_type: 'mobile',
    },
    JWT_SECRET,
    3600
  );
  headers = { Authorization: `Bearer ${token}`, 'X-Client-Type': 'mobile' };
  const insertEvent = () =>
    env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('互換テスト', '体育館', '10:00', '11:00') RETURNING event_id"
    ).first<{ event_id: number }>();
  eventId = (await insertEvent())!.event_id;
  emptyEventId = (await insertEvent())!.event_id;
  spotId = (await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('互換テスト集合場所') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>())!.gathering_spot_id;
  gatheringId = (await env.DB.prepare(
    'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
  )
    .bind(eventId, spotId)
    .first<{ gathering_id: number }>())!.gathering_id;
});

afterAll(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?').bind(
      gatheringId
    ),
    env.DB.prepare('DELETE FROM events WHERE event_id IN (?, ?)').bind(
      eventId,
      emptyEventId
    ),
    env.DB.prepare(
      'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
    ).bind(spotId),
  ]);
});

describe('配布済みmobile向け旧Event集合一覧APIの互換保護（#395）', () => {
  it('スタッフ権限のないmobile認証で従来の配列・全フィールドを返す', async () => {
    const response = await request(eventId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        gathering_id: gatheringId,
        event_id: eventId,
        gathering_spot_id: spotId,
        gathering_time: '99:59',
        round: 99,
        event_name: '互換テスト',
        gathering_spot_name: '互換テスト集合場所',
        created_at: expect.any(String),
        updated_at: expect.any(String),
      },
    ]);
  });

  it('集合予定がないイベントは空配列を返し、別イベントの集合を含めない', async () => {
    const response = await request(emptyEventId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('認証なしでは401を返す', async () => {
    const response = await request(eventId, {});
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: '認証が必要です' },
    });
  });

  it('mobileヘッダーなしでは401を返す', async () => {
    const response = await request(eventId, {
      Authorization: headers.Authorization,
    });
    expect(response.status).toBe(401);
  });

  it('不正なイベントIDは400を返す', async () => {
    const response = await request('invalid');
    expect(response.status).toBe(400);
  });

  it('存在しないイベントは404を返す', async () => {
    const response = await request(2147483647);
    expect(response.status).toBe(404);
  });

  it('公開OpenAPIに互換APIの維持理由・削除条件と既存の契約を残す', async () => {
    const response = await app.fetch(
      new Request('http://example.com/openapi.json'),
      env
    );
    const document = (await response.json()) as {
      paths: Record<
        string,
        {
          get: {
            description: string;
            security: unknown;
            responses: Record<string, unknown>;
          };
        }
      >;
    };
    const operation = document.paths['/api/v1/events/{eventId}/gatherings'].get;
    expect(operation.description).toContain('配布済みrectime-mobile');
    expect(operation.description).toContain('rectime-mobile#244');
    expect(operation.description).toContain('Android / iOS');
    expect(operation.description).toContain('サポート対象');
    expect(operation.description).toContain('他クライアント');
    expect(operation.description).toContain('#386');
    expect(operation.security).toEqual([{ Bearer: [] }]);
    expect(Object.keys(operation.responses).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '500',
    ]);
    expect(operation.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/GatheringList' },
        },
      },
    });
  });
});
