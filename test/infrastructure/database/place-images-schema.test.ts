import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

describe('実施場所・集合場所の画像', () => {
  afterEach(async () => {
    await env.DB.prepare(
      "DELETE FROM venues WHERE venue_name LIKE '画像テスト%'"
    ).run();
    await env.DB.prepare(
      "DELETE FROM gathering_spots WHERE gathering_spot_name LIKE '画像テスト%'"
    ).run();
    await env.IMAGES.delete('test/place.png');
  });

  it('実施場所は画像なしで作成できる', async () => {
    const venue = await env.DB.prepare(
      'INSERT INTO venues (venue_name) VALUES (?) RETURNING image_key'
    )
      .bind('画像テスト体育館')
      .first<{ image_key: string | null }>();

    expect(venue).toEqual({ image_key: null });
  });

  it('実施場所に画像を紐づけられる', async () => {
    const venue = await env.DB.prepare(
      'INSERT INTO venues (venue_name, image_key) VALUES (?, ?) RETURNING image_key'
    )
      .bind('画像テスト武道場', 'venues/1/a.webp')
      .first<{ image_key: string | null }>();

    expect(venue).toEqual({ image_key: 'venues/1/a.webp' });
  });

  it('集合場所は画像なしで作成できる', async () => {
    const spot = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING image_key'
    )
      .bind('画像テスト中庭')
      .first<{ image_key: string | null }>();

    expect(spot).toEqual({ image_key: null });
  });

  it('集合場所に画像を紐づけられる', async () => {
    const spot = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name, image_key) VALUES (?, ?) RETURNING image_key'
    )
      .bind('画像テスト正門', 'gathering-spots/1/a.webp')
      .first<{ image_key: string | null }>();

    expect(spot).toEqual({ image_key: 'gathering-spots/1/a.webp' });
  });

  it('保存先に置いた画像を種類つきで取り出せる', async () => {
    await env.IMAGES.put('test/place.png', new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: 'image/png' },
    });

    const object = await env.IMAGES.get('test/place.png');

    expect(object?.httpMetadata?.contentType).toBe('image/png');
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });
});
