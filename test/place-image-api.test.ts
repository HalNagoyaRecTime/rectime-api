import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'i'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };

async function createToken(isStaff: boolean): Promise<string> {
  const user = await workerEnv.DB.prepare(
    "INSERT INTO users (user_name) VALUES ('画像APIテストユーザー') RETURNING user_id"
  ).first<{ user_id: number }>();
  if (isStaff) {
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();
  }
  return signAccessToken(
    {
      sub: String(user!.user_id),
      oid: `place-image-${user!.user_id}`,
      email: 'place-image@example.com',
      display_name: '画像APIテストユーザー',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

async function insertVenue(): Promise<number> {
  const row = await workerEnv.DB.prepare(
    "INSERT INTO venues (venue_name) VALUES ('画像APIテスト体育館') RETURNING venue_id"
  ).first<{ venue_id: number }>();
  return row!.venue_id;
}

async function findImageKey(venueId: number): Promise<string | null> {
  const row = await workerEnv.DB.prepare(
    'SELECT image_key FROM venues WHERE venue_id = ?'
  )
    .bind(venueId)
    .first<{ image_key: string | null }>();
  return row!.image_key;
}

async function request(
  method: 'PUT' | 'DELETE',
  path: string,
  token: string
): Promise<Response> {
  return app.fetch(
    new Request(`http://example.com/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/png',
        'X-Client-Type': 'web',
      },
      body: method === 'PUT' ? new Uint8Array([1, 2, 3]) : undefined,
    }),
    testEnv
  );
}

describe('実施場所の画像API', () => {
  afterEach(async () => {
    const listed = await workerEnv.IMAGES.list({ prefix: 'venues/' });
    await Promise.all(
      listed.objects.map(object => workerEnv.IMAGES.delete(object.key))
    );
    await workerEnv.DB.prepare(
      "DELETE FROM venues WHERE venue_name = '画像APIテスト体育館'"
    ).run();
    await workerEnv.DB.prepare(
      "DELETE FROM staffs WHERE user_id IN (SELECT user_id FROM users WHERE user_name = '画像APIテストユーザー')"
    ).run();
    await workerEnv.DB.prepare(
      "DELETE FROM users WHERE user_name = '画像APIテストユーザー'"
    ).run();
  });

  it('スタッフが登録した画像は保存先に置かれ、実施場所に紐づく', async () => {
    const token = await createToken(true);
    const venueId = await insertVenue();

    const response = await request('PUT', `/venues/${venueId}/image`, token);

    expect(response.status).toBe(204);
    const imageKey = await findImageKey(venueId);
    const saved = await workerEnv.IMAGES.get(imageKey!);
    expect(saved?.httpMetadata?.contentType).toBe('image/png');
  });

  it('差し替えると前の画像は保存先から消える', async () => {
    const token = await createToken(true);
    const venueId = await insertVenue();
    await request('PUT', `/venues/${venueId}/image`, token);
    const oldKey = await findImageKey(venueId);

    await request('PUT', `/venues/${venueId}/image`, token);

    expect(await findImageKey(venueId)).not.toBe(oldKey);
    expect(await workerEnv.IMAGES.get(oldKey!)).toBeNull();
  });

  it('削除すると紐づけが外れ、保存先からも消える', async () => {
    const token = await createToken(true);
    const venueId = await insertVenue();
    await request('PUT', `/venues/${venueId}/image`, token);
    const imageKey = await findImageKey(venueId);

    const response = await request('DELETE', `/venues/${venueId}/image`, token);

    expect(response.status).toBe(204);
    expect(await findImageKey(venueId)).toBeNull();
    expect(await workerEnv.IMAGES.get(imageKey!)).toBeNull();
  });

  it('スタッフ以外は登録できない', async () => {
    const token = await createToken(false);
    const venueId = await insertVenue();

    const response = await request('PUT', `/venues/${venueId}/image`, token);

    expect(response.status).toBe(403);
    expect(await findImageKey(venueId)).toBeNull();
  });
});
