import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventRepository } from '../../../src/infrastructure/repositories/EventRepository';
import { createGatheringRepository } from '../../../src/infrastructure/repositories/GatheringRepository';
import { createGatheringSpotRepository } from '../../../src/infrastructure/repositories/GatheringSpotRepository';

describe('GatheringRepository', () => {
  const eventRepository = createEventRepository(env.DB);
  const gatheringSpotRepository = createGatheringSpotRepository(env.DB);
  const repository = createGatheringRepository(
    env.DB,
    eventRepository,
    gatheringSpotRepository
  );
  let gatheringIds: number[] = [];
  let eventIds: number[] = [];
  let spotIds: number[] = [];
  let userIds: number[] = [];

  async function createReferences(suffix: string) {
    const spot = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
      .bind(`集合テスト場所-${suffix}`)
      .first<{ gathering_spot_id: number }>();
    spotIds.push(spot!.gathering_spot_id);

    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    )
      .bind(`集合テスト競技-${suffix}`, '体育館', '0900', '1000')
      .first<{ event_id: number }>();
    eventIds.push(event!.event_id);

    return {
      spotId: spot!.gathering_spot_id,
      eventId: event!.event_id,
    };
  }

  afterEach(async () => {
    if (gatheringIds.length > 0) {
      await env.DB.batch(
        gatheringIds.flatMap(id => [
          env.DB.prepare(
            'DELETE FROM gathering_group_members WHERE gathering_id = ?'
          ).bind(id),
          env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?').bind(
            id
          ),
        ])
      );
    }
    if (userIds.length > 0) {
      await env.DB.batch(
        userIds.map(id =>
          env.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(id)
        )
      );
    }
    if (eventIds.length > 0) {
      await env.DB.batch(
        eventIds.map(id =>
          env.DB.prepare('DELETE FROM events WHERE event_id = ?').bind(id)
        )
      );
    }
    if (spotIds.length > 0) {
      await env.DB.batch(
        spotIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
          ).bind(id)
        )
      );
    }
    gatheringIds = [];
    eventIds = [];
    spotIds = [];
    userIds = [];
  });

  it('競技・集合場所を結合した集合予定を作成・取得できる', async () => {
    const { spotId, eventId } = await createReferences('作成取得');

    const created = await repository.create({
      event_id: eventId,
      gathering_spot_id: spotId,
      gathering_time: '08:50',
      round: 1,
    });
    gatheringIds.push(created.gathering_id);

    expect(created).toMatchObject({
      event_id: eventId,
      gathering_spot_id: spotId,
      event_name: '集合テスト競技-作成取得',
      gathering_spot_name: '集合テスト場所-作成取得',
      gathering_time: '08:50',
      round: 1,
    });
    expect(created).not.toHaveProperty('gathering_group_id');
  });

  it('任意項目を省略するとDBのデフォルト値を保存する', async () => {
    const { spotId, eventId } = await createReferences('デフォルト');

    const created = await repository.create({
      event_id: eventId,
      gathering_spot_id: spotId,
    });
    gatheringIds.push(created.gathering_id);

    expect(created).toMatchObject({ gathering_time: '99:59', round: 99 });
  });

  it('作成した集合予定をID順で一覧取得できる', async () => {
    const firstReferences = await createReferences('一覧1');
    const secondReferences = await createReferences('一覧2');
    const first = await repository.create({
      event_id: firstReferences.eventId,
      gathering_spot_id: firstReferences.spotId,
    });
    const second = await repository.create({
      event_id: secondReferences.eventId,
      gathering_spot_id: secondReferences.spotId,
    });
    gatheringIds.push(first.gathering_id, second.gathering_id);

    const all = await repository.findAll();
    const created = all.filter(gathering =>
      [first.gathering_id, second.gathering_id].includes(gathering.gathering_id)
    );

    expect(created.map(gathering => gathering.gathering_id)).toEqual([
      first.gathering_id,
      second.gathering_id,
    ]);
  });

  it('同じ競技に複数の集合予定を作成できる', async () => {
    const { spotId, eventId } = await createReferences('複数回');
    const first = await repository.create({
      event_id: eventId,
      gathering_spot_id: spotId,
      round: 1,
    });
    const second = await repository.create({
      event_id: eventId,
      gathering_spot_id: spotId,
      round: 2,
    });
    gatheringIds.push(first.gathering_id, second.gathering_id);

    expect(first.gathering_id).not.toBe(second.gathering_id);
  });

  it('競技IDを指定して複数の集合予定をID順で取得できる', async () => {
    const { spotId, eventId } = await createReferences('競技指定');
    const first = await repository.create({
      event_id: eventId,
      gathering_spot_id: spotId,
      round: 1,
    });
    const second = await repository.create({
      event_id: eventId,
      gathering_spot_id: spotId,
      round: 2,
    });
    gatheringIds.push(first.gathering_id, second.gathering_id);

    const result = await repository.findByEventId(eventId);

    expect(result.map(item => item.gathering_id)).toEqual([
      first.gathering_id,
      second.gathering_id,
    ]);
  });

  it('集合予定が未登録の競技では空配列を返す', async () => {
    const { eventId } = await createReferences('競技未登録');

    await expect(repository.findByEventId(eventId)).resolves.toEqual([]);
  });

  it('競技と集合場所の存在を確認できる', async () => {
    const { spotId, eventId } = await createReferences('存在確認');

    await expect(repository.existsEvent(eventId)).resolves.toBe(true);
    await expect(repository.existsEvent(999999)).resolves.toBe(false);
    await expect(repository.existsGatheringSpot(spotId)).resolves.toBe(true);
    await expect(repository.existsGatheringSpot(999999)).resolves.toBe(false);
  });

  it('存在しない競技または集合場所を参照する作成を拒否する', async () => {
    const { spotId, eventId } = await createReferences('外部キー');

    await expect(
      repository.create({
        event_id: 999999,
        gathering_spot_id: spotId,
      })
    ).rejects.toThrow();
    await expect(
      repository.create({
        event_id: eventId,
        gathering_spot_id: 999999,
      })
    ).rejects.toThrow();
  });

  it('集合メンバーと集合予定を同じbatchで削除する', async () => {
    const { spotId, eventId } = await createReferences('削除');
    const gathering = await repository.create({
      event_id: eventId,
      gathering_spot_id: spotId,
    });
    gatheringIds.push(gathering.gathering_id);
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('集合削除テスト') RETURNING user_id"
    ).first<{ user_id: number }>();
    userIds.push(user!.user_id);
    await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    )
      .bind(gathering.gathering_id, user!.user_id)
      .run();

    await expect(repository.remove(gathering.gathering_id)).resolves.toBe(true);

    const member = await env.DB.prepare(
      'SELECT gathering_group_member_id FROM gathering_group_members WHERE gathering_id = ?'
    )
      .bind(gathering.gathering_id)
      .first();
    const deletedGathering = await env.DB.prepare(
      'SELECT gathering_id FROM gatherings WHERE gathering_id = ?'
    )
      .bind(gathering.gathering_id)
      .first();
    expect(member).toBeNull();
    expect(deletedGathering).toBeNull();
  });

  it('存在しない集合予定の削除はfalseを返す', async () => {
    await expect(repository.remove(999999)).resolves.toBe(false);
  });
});
