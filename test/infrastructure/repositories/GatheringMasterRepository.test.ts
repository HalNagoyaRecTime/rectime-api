import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGatheringGroupMemberRepository } from '../../../src/infrastructure/repositories/GatheringGroupMemberRepository';
import { createGatheringGroupRepository } from '../../../src/infrastructure/repositories/GatheringGroupRepository';
import { createGatheringRepository } from '../../../src/infrastructure/repositories/GatheringRepository';
import { createGatheringSpotRepository } from '../../../src/infrastructure/repositories/GatheringSpotRepository';

describe('Gathering master repositories', () => {
  const gatheringSpotRepository = createGatheringSpotRepository(env.DB);
  const gatheringGroupRepository = createGatheringGroupRepository(env.DB);
  const gatheringGroupMemberRepository = createGatheringGroupMemberRepository(
    env.DB
  );
  const gatheringRepository = createGatheringRepository(env.DB);
  const userId = 940001;
  let gatheringIds: number[] = [];
  let eventIds: number[] = [];
  let gatheringSpotIds: number[] = [];
  let gatheringGroupIds: number[] = [];
  let testUserIds: number[] = [];

  beforeEach(async () => {
    gatheringIds = [];
    eventIds = [];
    gatheringSpotIds = [];
    gatheringGroupIds = [];
    testUserIds = [userId];
    await env.DB.prepare(
      'DELETE FROM gathering_group_members WHERE user_id = ?'
    )
      .bind(userId)
      .run();
    await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
      .bind(userId)
      .run();
    await env.DB.prepare(
      'INSERT INTO users (user_id, user_name, is_live_active) VALUES (?, ?, ?)'
    )
      .bind(userId, '集会テスト利用者', 1)
      .run();
  });

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
    await env.DB.batch(
      testUserIds.map(id =>
        env.DB.prepare(
          'DELETE FROM gathering_group_members WHERE user_id = ?'
        ).bind(id)
      )
    );
    if (gatheringGroupIds.length > 0) {
      await env.DB.batch(
        gatheringGroupIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_groups WHERE gathering_group_id = ?'
          ).bind(id)
        )
      );
    }
    if (gatheringSpotIds.length > 0) {
      await env.DB.batch(
        gatheringSpotIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
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
    await env.DB.batch(
      testUserIds.map(id =>
        env.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(id)
      )
    );
  });

  it('集合場所を作成し、ID順で取得できる', async () => {
    const first = await gatheringSpotRepository.create('体育館前');
    const second = await gatheringSpotRepository.create('正門前');
    gatheringSpotIds.push(first.gathering_spot_id, second.gathering_spot_id);

    const spots = await gatheringSpotRepository.findAll();
    const createdSpots = spots.filter(spot =>
      [first.gathering_spot_id, second.gathering_spot_id].includes(
        spot.gathering_spot_id
      )
    );

    expect(createdSpots.map(spot => spot.gathering_spot_id)).toEqual([
      first.gathering_spot_id,
      second.gathering_spot_id,
    ]);
  });

  it('集合場所の名称を更新し、存在しないIDはnullを返す', async () => {
    const spot = await gatheringSpotRepository.create('体育館前');
    gatheringSpotIds.push(spot.gathering_spot_id);

    await expect(
      gatheringSpotRepository.update(spot.gathering_spot_id, {
        gathering_spot_name: '正門前',
      })
    ).resolves.toMatchObject({
      gathering_spot_id: spot.gathering_spot_id,
      gathering_spot_name: '正門前',
    });
    await expect(
      gatheringSpotRepository.update(999999, {
        gathering_spot_name: '存在しない場所',
      })
    ).resolves.toBeNull();
  });

  it('集合グループを作成し、ID順で取得できる', async () => {
    const first = await gatheringGroupRepository.create();
    const second = await gatheringGroupRepository.create();
    gatheringGroupIds.push(first.gathering_group_id, second.gathering_group_id);

    const groups = await gatheringGroupRepository.findAll();
    const createdGroups = groups.filter(group =>
      [first.gathering_group_id, second.gathering_group_id].includes(
        group.gathering_group_id
      )
    );

    expect(createdGroups.map(group => group.gathering_group_id)).toEqual([
      first.gathering_group_id,
      second.gathering_group_id,
    ]);
  });

  it('ユーザーや名称を指定せず集合グループを作成できる', async () => {
    const group = await gatheringGroupRepository.create();
    gatheringGroupIds.push(group.gathering_group_id);

    expect(group).toEqual(
      expect.objectContaining({
        gathering_group_id: expect.any(Number),
        created_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
  });

  it('グループ所属を追加・一覧取得・解除でき、重複追加は防止する', async () => {
    const group = await gatheringGroupRepository.create();
    gatheringGroupIds.push(group.gathering_group_id);
    const member = await gatheringGroupMemberRepository.create(
      group.gathering_group_id,
      userId
    );

    await expect(
      gatheringGroupMemberRepository.findByGatheringGroupId(
        group.gathering_group_id
      )
    ).resolves.toEqual([
      expect.objectContaining({
        gathering_group_member_id: member.gathering_group_member_id,
        gathering_group_id: group.gathering_group_id,
        user_id: userId,
      }),
    ]);
    await expect(
      gatheringGroupMemberRepository.create(group.gathering_group_id, userId)
    ).rejects.toThrow('Gathering group member already exists');

    await expect(
      gatheringGroupMemberRepository.remove(group.gathering_group_id, userId)
    ).resolves.toBe(true);
    await expect(
      gatheringGroupMemberRepository.findByGatheringGroupId(
        group.gathering_group_id
      )
    ).resolves.toEqual([]);
  });

  it('存在しないグループまたはユーザーへの所属追加は失敗し、所属を作成しない', async () => {
    const group = await gatheringGroupRepository.create();
    gatheringGroupIds.push(group.gathering_group_id);

    await expect(
      gatheringGroupMemberRepository.create(999999, userId)
    ).rejects.toThrow();
    await expect(
      gatheringGroupMemberRepository.create(group.gathering_group_id, 999999)
    ).rejects.toThrow();
    await expect(
      gatheringGroupMemberRepository.findByGatheringGroupId(
        group.gathering_group_id
      )
    ).resolves.toEqual([]);
  });

  it('グループとユーザーの存在を確認できる', async () => {
    const group = await gatheringGroupRepository.create();
    gatheringGroupIds.push(group.gathering_group_id);

    await expect(
      gatheringGroupMemberRepository.existsGatheringGroup(
        group.gathering_group_id
      )
    ).resolves.toBe(true);
    await expect(
      gatheringGroupMemberRepository.existsGatheringGroup(999999)
    ).resolves.toBe(false);
    await expect(
      gatheringGroupMemberRepository.existsUser(userId)
    ).resolves.toBe(true);
    await expect(
      gatheringGroupMemberRepository.existsUser(999999)
    ).resolves.toBe(false);
  });

  it('グループで所属を絞り込み、ID順で取得できる', async () => {
    const firstGroup = await gatheringGroupRepository.create();
    const secondGroup = await gatheringGroupRepository.create();
    gatheringGroupIds.push(
      firstGroup.gathering_group_id,
      secondGroup.gathering_group_id
    );
    const first = await gatheringGroupMemberRepository.create(
      firstGroup.gathering_group_id,
      userId
    );
    const secondUserId = 940002;
    testUserIds.push(secondUserId);
    await env.DB.prepare(
      'INSERT INTO users (user_id, user_name, is_live_active) VALUES (?, ?, ?)'
    )
      .bind(secondUserId, '集会テスト利用者2', 1)
      .run();
    const second = await gatheringGroupMemberRepository.create(
      firstGroup.gathering_group_id,
      secondUserId
    );
    await gatheringGroupMemberRepository.create(
      secondGroup.gathering_group_id,
      userId
    );

    await expect(
      gatheringGroupMemberRepository.findByGatheringGroupId(
        firstGroup.gathering_group_id
      )
    ).resolves.toEqual([
      expect.objectContaining({
        gathering_group_member_id: first.gathering_group_member_id,
      }),
      expect.objectContaining({
        gathering_group_member_id: second.gathering_group_member_id,
      }),
    ]);
  });

  it('存在しない所属の解除はfalseを返す', async () => {
    const group = await gatheringGroupRepository.create();
    gatheringGroupIds.push(group.gathering_group_id);

    await expect(
      gatheringGroupMemberRepository.remove(group.gathering_group_id, userId)
    ).resolves.toBe(false);
  });

  it('集合グループと所属を削除し、存在しないグループはfalseを返す', async () => {
    const group = await gatheringGroupRepository.create();
    gatheringGroupIds.push(group.gathering_group_id);
    await gatheringGroupMemberRepository.create(
      group.gathering_group_id,
      userId
    );

    await expect(
      gatheringGroupRepository.remove(group.gathering_group_id)
    ).resolves.toBe(true);

    const deletedGroup = await env.DB.prepare(
      'SELECT gathering_group_id FROM gathering_groups WHERE gathering_group_id = ?'
    )
      .bind(group.gathering_group_id)
      .first();
    const deletedMember = await env.DB.prepare(
      'SELECT gathering_group_member_id FROM gathering_group_members WHERE gathering_group_id = ?'
    )
      .bind(group.gathering_group_id)
      .first();
    const remainingUser = await env.DB.prepare(
      'SELECT user_id FROM users WHERE user_id = ?'
    )
      .bind(userId)
      .first();

    expect(deletedGroup).toBeNull();
    expect(deletedMember).toBeNull();
    expect(remainingUser).not.toBeNull();
    await expect(gatheringGroupRepository.remove(999999)).resolves.toBe(false);
  });

  it('集合設定から参照されているグループの削除を拒否し、所属も維持する', async () => {
    const group = await gatheringGroupRepository.create();
    gatheringGroupIds.push(group.gathering_group_id);
    const member = await gatheringGroupMemberRepository.create(
      group.gathering_group_id,
      userId
    );
    const spot = await gatheringSpotRepository.create('参照中削除テスト場所');
    gatheringSpotIds.push(spot.gathering_spot_id);
    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    )
      .bind('参照中削除テスト競技', '体育館', '0900', '1000')
      .first<{ event_id: number }>();
    eventIds.push(event!.event_id);
    const gathering = await gatheringRepository.create({
      gathering_group_id: group.gathering_group_id,
      event_id: event!.event_id,
      gathering_spot_id: spot.gathering_spot_id,
    });
    gatheringIds.push(gathering.gathering_id);

    await expect(
      gatheringGroupRepository.remove(group.gathering_group_id)
    ).rejects.toThrow('Gathering group is assigned to an event');

    const remainingGroup = await env.DB.prepare(
      'SELECT gathering_group_id FROM gathering_groups WHERE gathering_group_id = ?'
    )
      .bind(group.gathering_group_id)
      .first();
    const remainingMember = await env.DB.prepare(
      'SELECT gathering_group_member_id FROM gathering_group_members WHERE gathering_group_member_id = ?'
    )
      .bind(member.gathering_group_member_id)
      .first();
    const remainingGathering = await env.DB.prepare(
      'SELECT gathering_id FROM gatherings WHERE gathering_id = ?'
    )
      .bind(gathering.gathering_id)
      .first();

    expect(remainingGroup).not.toBeNull();
    expect(remainingMember).not.toBeNull();
    expect(remainingGathering).not.toBeNull();
  });
});
