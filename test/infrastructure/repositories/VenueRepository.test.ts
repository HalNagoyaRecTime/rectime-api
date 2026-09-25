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

  it('削除できた場合のみ true を返す', async () => {
    const venue = await venueRepository.create('実施場所テスト削除');

    expect(await venueRepository.delete(venue.venue_id)).toBe(true);
    expect(await venueRepository.delete(venue.venue_id)).toBe(false);
  });

  it('競技から参照されている実施場所を hasEvents で判定する', async () => {
    const venue = await venueRepository.create('実施場所テスト参照');
    expect(await venueRepository.hasEvents(venue.venue_id)).toBe(false);

    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    )
      .bind('実施場所テスト競技', '体育館', '0900', '1000')
      .first<{ event_id: number }>();
    await env.DB.prepare(
      'INSERT INTO event_venues (event_id, venue_id) VALUES (?, ?)'
    )
      .bind(event!.event_id, venue.venue_id)
      .run();

    expect(await venueRepository.hasEvents(venue.venue_id)).toBe(true);
  });
});
