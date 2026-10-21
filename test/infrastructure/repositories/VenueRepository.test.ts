import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createVenueRepository } from '../../../src/infrastructure/repositories/VenueRepository';

describe('VenueRepository', () => {
  const venueRepository = createVenueRepository(env.DB);

  afterEach(async () => {
    await env.DB.prepare(
      "DELETE FROM event_venues WHERE venue_id IN (SELECT venue_id FROM venues WHERE venue_name LIKE '実施場所テスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM venues WHERE venue_name LIKE '実施場所テスト%'"
    ).run();
    await env.DB.prepare(
      "DELETE FROM events WHERE event_name LIKE '実施場所テスト%'"
    ).run();
  });

  it('作成した実施場所を venue_id 昇順で返す', async () => {
    const first = await venueRepository.create('実施場所テストA');
    const second = await venueRepository.create('実施場所テストB');

    const found = (await venueRepository.findAll()).filter(venue =>
      venue.venue_name.startsWith('実施場所テスト')
    );

    expect(found.map(venue => venue.venue_id)).toEqual([
      first.venue_id,
      second.venue_id,
    ]);
    expect(found[0]).toMatchObject({ venue_name: '実施場所テストA' });
  });

  it('同じ名前は UNIQUE 制約で作成できない', async () => {
    await venueRepository.create('実施場所テスト重複');

    await expect(
      venueRepository.create('実施場所テスト重複')
    ).rejects.toThrow();
  });

  it('名前で絞り込み、総件数付きで返す', async () => {
    await venueRepository.create('実施場所テスト第1体育館');
    await venueRepository.create('実施場所テスト第2体育館');
    await venueRepository.create('実施場所テストグラウンド');

    const page = await venueRepository.findPage({
      limit: 20,
      offset: 0,
      name: '実施場所テスト第',
    });

    expect(page.total).toBe(2);
    expect(page.venues.map(venue => venue.venue_name)).toEqual([
      '実施場所テスト第1体育館',
      '実施場所テスト第2体育館',
    ]);
    expect(page).toMatchObject({ limit: 20, offset: 0 });
  });

  it('名前の絞り込みでワイルドカードを文字として扱う', async () => {
    await venueRepository.create('実施場所テスト100%コート');
    await venueRepository.create('実施場所テスト第1コート');

    const page = await venueRepository.findPage({
      limit: 20,
      offset: 0,
      name: '100%',
    });

    expect(page.venues.map(venue => venue.venue_name)).toEqual([
      '実施場所テスト100%コート',
    ]);
  });

  it('name の降順で並べ替えられる', async () => {
    await venueRepository.create('実施場所テストA');
    await venueRepository.create('実施場所テストB');

    const page = await venueRepository.findPage({
      limit: 20,
      offset: 0,
      name: '実施場所テスト',
      sortBy: 'name',
      sortOrder: 'desc',
    });

    expect(page.venues.map(venue => venue.venue_name)).toEqual([
      '実施場所テストB',
      '実施場所テストA',
    ]);
  });

  it('名前を更新でき、存在しないIDでは null を返す', async () => {
    const venue = await venueRepository.create('実施場所テスト更新前');

    const updated = await venueRepository.update(venue.venue_id, {
      venue_name: '実施場所テスト更新後',
    });

    expect(updated).toMatchObject({
      venue_id: venue.venue_id,
      venue_name: '実施場所テスト更新後',
    });
    expect(
      await venueRepository.update(999999, { venue_name: '実施場所テスト' })
    ).toBeNull();
  });

  describe('更新の楽観ロック', () => {
    it('作成直後の lock_version は 0 で、更新のたびに 1 ずつ増える', async () => {
      const venue = await venueRepository.create('実施場所テストロック');
      expect(venue.lock_version).toBe(0);

      const first = await venueRepository.update(venue.venue_id, {
        venue_name: '実施場所テストロック1',
      });
      const second = await venueRepository.update(venue.venue_id, {
        venue_name: '実施場所テストロック2',
      });

      expect(first?.lock_version).toBe(1);
      expect(second?.lock_version).toBe(2);
    });

    it('取得時点の lock_version を指定すると、一致すれば更新して版を進める', async () => {
      const venue = await venueRepository.create('実施場所テストロック一致');

      const updated = await venueRepository.update(venue.venue_id, {
        venue_name: '実施場所テストロック一致後',
        expected_lock_version: venue.lock_version,
      });

      expect(updated).toMatchObject({
        venue_name: '実施場所テストロック一致後',
        lock_version: venue.lock_version + 1,
      });
    });

    it('lock_version が取得時点と違えば更新せず null を返す', async () => {
      const venue = await venueRepository.create('実施場所テストロック不一致');
      await venueRepository.update(venue.venue_id, {
        venue_name: '実施場所テストロック別操作',
      });

      const result = await venueRepository.update(venue.venue_id, {
        venue_name: '実施場所テストロック古い版',
        expected_lock_version: venue.lock_version,
      });

      expect(result).toBeNull();
      const [stored] = (await venueRepository.findAll()).filter(
        found => found.venue_id === venue.venue_id
      );
      expect(stored).toMatchObject({
        venue_name: '実施場所テストロック別操作',
        lock_version: 1,
      });
    });

    it('同じ版から続けて更新しても、2回目は null になる（同じ秒内でも検出できる）', async () => {
      const venue = await venueRepository.create('実施場所テストロック連続');

      const first = await venueRepository.update(venue.venue_id, {
        venue_name: '実施場所テストロック連続1',
        expected_lock_version: venue.lock_version,
      });
      const second = await venueRepository.update(venue.venue_id, {
        venue_name: '実施場所テストロック連続2',
        expected_lock_version: venue.lock_version,
      });

      expect(first).not.toBeNull();
      expect(second).toBeNull();
    });

    it('画像キーの差し替えでも lock_version が進む', async () => {
      const venue = await venueRepository.create('実施場所テストロック画像');

      await venueRepository.replaceImageKey(
        venue.venue_id,
        null,
        'venues/1/a.png'
      );

      const stale = await venueRepository.update(venue.venue_id, {
        venue_name: '実施場所テストロック画像後',
        expected_lock_version: venue.lock_version,
      });
      expect(stale).toBeNull();
    });
  });

  it('削除できた場合のみ true を返す', async () => {
    const venue = await venueRepository.create('実施場所テスト削除');

    expect(await venueRepository.delete(venue.venue_id)).toBe(true);
    expect(await venueRepository.delete(venue.venue_id)).toBe(false);
  });

  it('競技から参照されている実施場所を hasEvents で判定する', async () => {
    const venue = await venueRepository.create('実施場所テスト参照');
    expect(await venueRepository.hasEvents(venue.venue_id)).toBe(false);

    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, start_time, end_time) VALUES (?, ?, ?) RETURNING event_id'
    )
      .bind('実施場所テスト競技', '0900', '1000')
      .first<{ event_id: number }>();
    await env.DB.prepare(
      'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
    )
      .bind(event!.event_id, venue.venue_id)
      .run();

    expect(await venueRepository.hasEvents(venue.venue_id)).toBe(true);
  });

  it('画像キーを紐づけて取得でき、外すと null に戻る', async () => {
    const venue = await venueRepository.create('実施場所テスト画像');

    expect(
      await venueRepository.replaceImageKey(
        venue.venue_id,
        null,
        'venues/1/a.png'
      )
    ).toBe(true);
    expect(await venueRepository.findImageKey(venue.venue_id)).toEqual({
      imageKey: 'venues/1/a.png',
    });

    expect(
      await venueRepository.replaceImageKey(
        venue.venue_id,
        'venues/1/a.png',
        null
      )
    ).toBe(true);
    expect(await venueRepository.findImageKey(venue.venue_id)).toEqual({
      imageKey: null,
    });
  });

  it('画像キーが読み取ったときから変わっていれば更新せず false を返す', async () => {
    const venue = await venueRepository.create('実施場所テスト画像競合');
    await venueRepository.replaceImageKey(
      venue.venue_id,
      null,
      'venues/1/other.png'
    );

    expect(
      await venueRepository.replaceImageKey(
        venue.venue_id,
        null,
        'venues/1/a.png'
      )
    ).toBe(false);
    expect(await venueRepository.findImageKey(venue.venue_id)).toEqual({
      imageKey: 'venues/1/other.png',
    });
  });

  it('存在しない実施場所の画像キーは更新せず false を返す', async () => {
    expect(
      await venueRepository.replaceImageKey(999999, null, 'venues/1/a.png')
    ).toBe(false);
  });

  it('存在しない実施場所の画像キーは null を返す', async () => {
    expect(await venueRepository.findImageKey(999999)).toBeNull();
  });
});
