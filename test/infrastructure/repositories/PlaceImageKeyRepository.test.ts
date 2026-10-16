import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createPlaceImageKeyRepository } from '../../../src/infrastructure/repositories/PlaceImageKeyRepository';

describe('PlaceImageKeyRepository', () => {
  const repository = createPlaceImageKeyRepository(env.DB);

  afterEach(async () => {
    await env.DB.prepare(
      "DELETE FROM venues WHERE venue_name LIKE '画像キーテスト%'"
    ).run();
    await env.DB.prepare(
      "DELETE FROM gathering_spots WHERE gathering_spot_name LIKE '画像キーテスト%'"
    ).run();
  });

  it('実施場所が使っている画像キーは使用中と判定する', async () => {
    await env.DB.prepare(
      "INSERT INTO venues (venue_name, image_key) VALUES ('画像キーテスト体育館', 'seed/a.png')"
    ).run();

    expect(await repository.isInUse('seed/a.png')).toBe(true);
  });

  it('集合場所が使っている画像キーは使用中と判定する', async () => {
    await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name, image_key) VALUES ('画像キーテスト正門', 'seed/b.png')"
    ).run();

    expect(await repository.isInUse('seed/b.png')).toBe(true);
  });

  it('どこからも使われていない画像キーは未使用と判定する', async () => {
    expect(await repository.isInUse('seed/unused.png')).toBe(false);
  });
});
