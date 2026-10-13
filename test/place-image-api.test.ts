import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_PLACE_IMAGE_BYTES } from '../src/application/services/PlaceImageService';
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

async function insertVenue(name = '画像APIテスト体育館'): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO venues (venue_name) VALUES (?) RETURNING venue_id'
  )
    .bind(name)
    .first<{ venue_id: number }>();
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

function countingBody(totalBytes: number) {
  const chunk = new Uint8Array(1024 * 1024);
  let read = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (read >= totalBytes) {
          controller.close();
          return;
        }
        read += chunk.byteLength;
        controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 }
  );
  return { body, readBytes: () => read };
}

async function putImage(
  path: string,
  token: string,
  body: BodyInit,
  headers: Record<string, string> = {}
): Promise<Response> {
  return app.fetch(
    new Request(`http://example.com/api/v1${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/png',
        'X-Client-Type': 'web',
        ...headers,
      },
      body,
      duplex: 'half',
    } as RequestInit),
    testEnv
  );
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
      "DELETE FROM venues WHERE venue_name LIKE '画像APIテスト%'"
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

  it('同じ画像を使う場所が残っていれば、片方を差し替えても画像は消さない', async () => {
    const token = await createToken(true);
    const first = await insertVenue('画像APIテスト第1体育館');
    const second = await insertVenue('画像APIテスト第2体育館');
    await workerEnv.IMAGES.put('venues/shared.png', new Uint8Array([9]));
    await workerEnv.DB.prepare(
      "UPDATE venues SET image_key = 'venues/shared.png' WHERE venue_id IN (?, ?)"
    )
      .bind(first, second)
      .run();

    const response = await request('PUT', `/venues/${first}/image`, token);

    expect(response.status).toBe(204);
    expect(await findImageKey(second)).toBe('venues/shared.png');
    expect(await workerEnv.IMAGES.get('venues/shared.png')).not.toBeNull();
  });

  it('Content-Length が5MBを超える本文は、読み込まずに400を返す', async () => {
    const token = await createToken(true);
    const venueId = await insertVenue();
    const { body, readBytes } = countingBody(MAX_PLACE_IMAGE_BYTES * 4);

    const response = await putImage(`/venues/${venueId}/image`, token, body, {
      'Content-Length': String(MAX_PLACE_IMAGE_BYTES * 4),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_PLACE_IMAGE' },
    });
    expect(readBytes()).toBe(0);
    expect(await findImageKey(venueId)).toBeNull();
  });

  it('Content-Length の無い本文は、5MBを超えた時点で読み込みを打ち切り400を返す', async () => {
    const token = await createToken(true);
    const venueId = await insertVenue();
    const { body, readBytes } = countingBody(MAX_PLACE_IMAGE_BYTES * 4);

    const response = await putImage(`/venues/${venueId}/image`, token, body);

    expect(response.status).toBe(400);
    expect(readBytes()).toBeLessThan(MAX_PLACE_IMAGE_BYTES * 2);
    expect(await findImageKey(venueId)).toBeNull();
  });

  it('スタッフ以外は登録できない', async () => {
    const token = await createToken(false);
    const venueId = await insertVenue();

    const response = await request('PUT', `/venues/${venueId}/image`, token);

    expect(response.status).toBe(403);
    expect(await findImageKey(venueId)).toBeNull();
  });
});
