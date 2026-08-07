import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createGatheringGroupMemberRepository } from '../../../src/infrastructure/repositories/GatheringGroupMemberRepository';
import { createGatheringSpotRepository } from '../../../src/infrastructure/repositories/GatheringSpotRepository';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';

describe('Gathering master repositories', () => {
  const gatheringSpotRepository = createGatheringSpotRepository(env.DB);
  const userRepository = createUserRepository(env.DB);
  const memberRepository = createGatheringGroupMemberRepository(
    env.DB,
    userRepository
  );
  let gatheringIds: number[] = [];
  let gatheringSpotIds: number[] = [];
  let eventIds: number[] = [];
  let userIds: number[] = [];

  async function createGathering(suffix: string): Promise<number> {
    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    )
      .bind(`所属テスト競技-${suffix}`, '体育館', '0900', '1000')
      .first<{ event_id: number }>();
    eventIds.push(event!.event_id);
    const spot = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
      .bind(`所属テスト場所-${suffix}`)
      .first<{ gathering_spot_id: number }>();
    gatheringSpotIds.push(spot!.gathering_spot_id);
    const gathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
    )
      .bind(event!.event_id, spot!.gathering_spot_id)
      .first<{ gathering_id: number }>();
    gatheringIds.push(gathering!.gathering_id);
    return gathering!.gathering_id;
  }

  async function createUser(name: string): Promise<number> {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(name)
      .first<{ user_id: number }>();
    userIds.push(user!.user_id);
    return user!.user_id;
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
    if (gatheringSpotIds.length > 0) {
      await env.DB.batch(
        gatheringSpotIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
          ).bind(id)
        )
      );
    }
    gatheringIds = [];
    gatheringSpotIds = [];
    eventIds = [];
    userIds = [];
  });

  it('集合場所を作成し、ID順で取得できる', async () => {
    const first = await gatheringSpotRepository.create('体育館前');
    const second = await gatheringSpotRepository.create('正門前');
    gatheringSpotIds.push(first.gathering_spot_id, second.gathering_spot_id);

    const spots = await gatheringSpotRepository.findAll();
    const created = spots.filter(spot =>
      [first.gathering_spot_id, second.gathering_spot_id].includes(
        spot.gathering_spot_id
      )
    );

    expect(created.map(spot => spot.gathering_spot_id)).toEqual([
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

  it('集合場所の存在を確認できる', async () => {
    const spot = await gatheringSpotRepository.create('体育館前');
    gatheringSpotIds.push(spot.gathering_spot_id);

    await expect(
      gatheringSpotRepository.exists(spot.gathering_spot_id)
    ).resolves.toBe(true);
    await expect(gatheringSpotRepository.exists(999999)).resolves.toBe(false);
  });

  it('集合場所一覧を名称検索・ページネーションできる', async () => {
    const first = await gatheringSpotRepository.create('体育館前');
    const second = await gatheringSpotRepository.create('体育館裏');
    const third = await gatheringSpotRepository.create('正門前');
    gatheringSpotIds.push(
      first.gathering_spot_id,
      second.gathering_spot_id,
      third.gathering_spot_id
    );

    await expect(
      gatheringSpotRepository.findPage({ name: '体育館', limit: 1, offset: 0 })
    ).resolves.toMatchObject({
      total: 2,
      limit: 1,
      offset: 0,
      gathering_spots: [
        expect.objectContaining({
          gathering_spot_id: first.gathering_spot_id,
          gathering_spot_name: '体育館前',
        }),
      ],
    });
  });

  it('集合場所一覧を指定した列と方向でソートできる', async () => {
    const first = await gatheringSpotRepository.create('体育館前');
    const second = await gatheringSpotRepository.create('正門前');
    const third = await gatheringSpotRepository.create('校庭');
    gatheringSpotIds.push(
      first.gathering_spot_id,
      second.gathering_spot_id,
      third.gathering_spot_id
    );

    await expect(
      gatheringSpotRepository.findPage({
        limit: 20,
        offset: 0,
        sortBy: 'name',
        sortOrder: 'desc',
      })
    ).resolves.toMatchObject({
      gathering_spots: [
        expect.objectContaining({ gathering_spot_name: '正門前' }),
        expect.objectContaining({ gathering_spot_name: '校庭' }),
        expect.objectContaining({ gathering_spot_name: '体育館前' }),
      ],
    });
  });

  it('集合対象者を追加・一覧取得・解除でき、重複追加を防止する', async () => {
    const gatheringId = await createGathering('基本');
    const userId = await createUser('集合対象者1');
    const member = await memberRepository.create(gatheringId, userId);

    await expect(
      memberRepository.findByGatheringId(gatheringId)
    ).resolves.toEqual([
      expect.objectContaining({
        gathering_group_member_id: member.gathering_group_member_id,
        gathering_id: gatheringId,
        user_id: userId,
      }),
    ]);
    await expect(memberRepository.create(gatheringId, userId)).rejects.toThrow(
      'Gathering member already exists'
    );

    await expect(memberRepository.remove(gatheringId, userId)).resolves.toBe(
      true
    );
    await expect(
      memberRepository.findByGatheringId(gatheringId)
    ).resolves.toEqual([]);
  });

  it('1つの集合に複数人を登録でき、同じ利用者を別の集合にも登録できる', async () => {
    const firstGatheringId = await createGathering('複数1');
    const secondGatheringId = await createGathering('複数2');
    const firstUserId = await createUser('集合対象者2');
    const secondUserId = await createUser('集合対象者3');

    await memberRepository.create(firstGatheringId, firstUserId);
    await memberRepository.create(firstGatheringId, secondUserId);
    await memberRepository.create(secondGatheringId, firstUserId);

    await expect(
      memberRepository.findByGatheringId(firstGatheringId)
    ).resolves.toHaveLength(2);
    await expect(
      memberRepository.findByGatheringId(secondGatheringId)
    ).resolves.toHaveLength(1);
  });

  it('存在しない集合または利用者への追加を拒否する', async () => {
    const gatheringId = await createGathering('外部キー');
    const userId = await createUser('集合対象者4');

    await expect(memberRepository.create(999999, userId)).rejects.toThrow();
    await expect(
      memberRepository.create(gatheringId, 999999)
    ).rejects.toThrow();
    await expect(
      memberRepository.findByGatheringId(gatheringId)
    ).resolves.toEqual([]);
  });

  it('集合と利用者の存在を確認できる', async () => {
    const gatheringId = await createGathering('存在確認');
    const userId = await createUser('集合対象者5');

    await expect(memberRepository.existsGathering(gatheringId)).resolves.toBe(
      true
    );
    await expect(memberRepository.existsGathering(999999)).resolves.toBe(false);
    await expect(memberRepository.existsUser(userId)).resolves.toBe(true);
    await expect(memberRepository.existsUser(999999)).resolves.toBe(false);
  });

  it('存在しない集合対象者の解除はfalseを返す', async () => {
    const gatheringId = await createGathering('解除');
    const userId = await createUser('集合対象者6');

    await expect(memberRepository.remove(gatheringId, userId)).resolves.toBe(
      false
    );
  });
});
