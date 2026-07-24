import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createGatheringRepository } from '../../../src/infrastructure/repositories/GatheringRepository';

describe('GatheringRepository', () => {
  const repository = createGatheringRepository(env.DB);
  let gatheringIds: number[] = [];
  let groupIds: number[] = [];
  let eventIds: number[] = [];
  let spotIds: number[] = [];

  async function createReferences(suffix: string) {
    const group = await env.DB.prepare(
      'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
    ).first<{ gathering_group_id: number }>();
    groupIds.push(group!.gathering_group_id);
    const spot = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
      .bind(`集会テスト場所-${suffix}`)
      .first<{ gathering_spot_id: number }>();
    spotIds.push(spot!.gathering_spot_id);
    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    )
      .bind(`集会テストイベント-${suffix}`, '体育館', '0900', '1000')
      .first<{ event_id: number }>();
    eventIds.push(event!.event_id);
    return {
      groupId: group!.gathering_group_id,
      spotId: spot!.gathering_spot_id,
      eventId: event!.event_id,
    };
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
    if (groupIds.length > 0) {
      await env.DB.batch(
        groupIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_groups WHERE gathering_group_id = ?'
          ).bind(id)
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
    groupIds = [];
    eventIds = [];
    spotIds = [];
  });

  it('イベント・グループ・集合場所を結合した集会情報を作成・取得できる', async () => {
    const { groupId, spotId, eventId } = await createReferences('作成取得');
    const created = await repository.create({
      gathering_group_id: groupId,
      event_id: eventId,
      gathering_spot_id: spotId,
      gathering_time: '08:50',
      round: 1,
    });
    gatheringIds.push(created.gathering_id);

    expect(created).toMatchObject({
      event_name: '集会テストイベント-作成取得',
      gathering_spot_name: '集会テスト場所-作成取得',
      gathering_time: '08:50',
      round: 1,
    });
  });

  it('任意項目を省略するとDBのデフォルト値を保存する', async () => {
    const { groupId, spotId, eventId } = await createReferences('デフォルト');
    const created = await repository.create({
      gathering_group_id: groupId,
      event_id: eventId,
      gathering_spot_id: spotId,
    });
    gatheringIds.push(created.gathering_id);

    expect(created).toMatchObject({ gathering_time: '99:59', round: 99 });
  });

  it('作成した集会情報をID順で一覧取得できる', async () => {
    const firstReferences = await createReferences('一覧1');
    const secondReferences = await createReferences('一覧2');
    const first = await repository.create({
      gathering_group_id: firstReferences.groupId,
      event_id: firstReferences.eventId,
      gathering_spot_id: firstReferences.spotId,
    });
    const second = await repository.create({
      gathering_group_id: secondReferences.groupId,
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

  it('同じグループへの重複作成を拒否する', async () => {
    const { groupId, spotId, eventId } = await createReferences('重複');
    const created = await repository.create({
      gathering_group_id: groupId,
      event_id: eventId,
      gathering_spot_id: spotId,
    });
    gatheringIds.push(created.gathering_id);

    await expect(
      repository.create({
        gathering_group_id: groupId,
        event_id: eventId,
        gathering_spot_id: spotId,
      })
    ).rejects.toThrow('Gathering already exists for this group');
  });

  it('グループ・イベント・集合場所の存在を確認できる', async () => {
    const { groupId, spotId, eventId } = await createReferences('存在確認');

    await expect(repository.existsGatheringGroup(groupId)).resolves.toBe(true);
    await expect(repository.existsGatheringGroup(999999)).resolves.toBe(false);
    await expect(repository.existsEvent(eventId)).resolves.toBe(true);
    await expect(repository.existsEvent(999999)).resolves.toBe(false);
    await expect(repository.existsGatheringSpot(spotId)).resolves.toBe(true);
    await expect(repository.existsGatheringSpot(999999)).resolves.toBe(false);
  });
});
