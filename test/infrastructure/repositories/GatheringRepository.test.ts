import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventRepository } from '../../../src/infrastructure/repositories/EventRepository';
import { createGatheringRepository } from '../../../src/infrastructure/repositories/GatheringRepository';

describe('GatheringRepository', () => {
  const eventRepository = createEventRepository(env.DB);
  const repository = createGatheringRepository(env.DB, eventRepository);
  let gatheringIds: number[] = [];
  let eventIds: number[] = [];
  let spotIds: number[] = [];

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

  // 読み取りテストの初期データは、廃止したWrite処理を経由せずに用意する。
  async function insertGathering(
    eventId: number,
    spotId: number,
    round = 1,
    gatheringTime = '08:50'
  ): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id, round, gathering_time) VALUES (?, ?, ?, ?) RETURNING gathering_id'
    )
      .bind(eventId, spotId, round, gatheringTime)
      .first<{ gathering_id: number }>();
    gatheringIds.push(row!.gathering_id);
    return row!.gathering_id;
  }

  afterEach(async () => {
    if (gatheringIds.length > 0) {
      await env.DB.batch(
        gatheringIds.map(id =>
          env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?').bind(
            id
          )
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
  });

  it('競技・集合場所を結合した既存の集合予定を取得できる', async () => {
    const { spotId, eventId } = await createReferences('取得');
    const gatheringId = await insertGathering(eventId, spotId);

    const result = await repository.findByEventId(eventId);

    expect(result).toEqual([
      expect.objectContaining({
        gathering_id: gatheringId,
        event_id: eventId,
        gathering_spot_id: spotId,
        event_name: '集合テスト競技-取得',
        gathering_spot_name: '集合テスト場所-取得',
        gathering_time: '08:50',
        round: 1,
        created_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    ]);
    expect(result[0]).not.toHaveProperty('gathering_group_id');
  });

  it('旧APIで保存された未設定値もそのまま取得できる', async () => {
    const { spotId, eventId } = await createReferences('未設定');
    await insertGathering(eventId, spotId, 99, '99:59');

    await expect(repository.findByEventId(eventId)).resolves.toEqual([
      expect.objectContaining({ gathering_time: '99:59', round: 99 }),
    ]);
  });

  it('複数の競技の集合予定をID順で一覧取得できる', async () => {
    const firstReferences = await createReferences('一覧1');
    const secondReferences = await createReferences('一覧2');
    const firstId = await insertGathering(
      firstReferences.eventId,
      firstReferences.spotId
    );
    const secondId = await insertGathering(
      secondReferences.eventId,
      secondReferences.spotId
    );

    const all = await repository.findAll();
    const created = all.filter(gathering =>
      [firstId, secondId].includes(gathering.gathering_id)
    );

    expect(created.map(gathering => gathering.gathering_id)).toEqual([
      firstId,
      secondId,
    ]);
  });

  it('指定した競技だけの集合予定をID順で取得できる', async () => {
    const { spotId, eventId } = await createReferences('競技指定');
    const other = await createReferences('対象外');
    const firstId = await insertGathering(eventId, spotId, 2);
    await insertGathering(other.eventId, other.spotId);
    const secondId = await insertGathering(eventId, spotId, 1);

    const result = await repository.findByEventId(eventId);

    expect(result.map(item => item.gathering_id)).toEqual([firstId, secondId]);
  });

  it('集合予定が未登録の競技では空配列を返す', async () => {
    const { eventId } = await createReferences('競技未登録');

    await expect(repository.findByEventId(eventId)).resolves.toEqual([]);
  });

  it('競技の存在を確認できる', async () => {
    const { eventId } = await createReferences('存在確認');

    await expect(repository.existsEvent(eventId)).resolves.toBe(true);
    await expect(repository.existsEvent(999999)).resolves.toBe(false);
  });
});
