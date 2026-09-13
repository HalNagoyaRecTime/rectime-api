import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createGatheringGroupMemberService } from '../../../src/application/services/GatheringGroupMemberService';
import { createGatheringGroupMemberRepository } from '../../../src/infrastructure/repositories/GatheringGroupMemberRepository';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';

describe('GatheringGroupMemberRepository', () => {
  const userRepository = createUserRepository(env.DB);
  const repository = createGatheringGroupMemberRepository(
    env.DB,
    userRepository
  );

  let gatheringIds: number[] = [];
  let eventIds: number[] = [];
  let spotIds: number[] = [];
  let userIds: number[] = [];

  async function createGathering(suffix: string) {
    const spot = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
      .bind(`集合メンバーテスト場所-${suffix}`)
      .first<{ gathering_spot_id: number }>();
    spotIds.push(spot!.gathering_spot_id);

    const event = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    )
      .bind(`集合メンバーテスト競技-${suffix}`, '体育館', '0900', '1000')
      .first<{ event_id: number }>();
    eventIds.push(event!.event_id);

    const gathering = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id, gathering_time, round) VALUES (?, ?, ?, ?) RETURNING gathering_id'
    )
      .bind(event!.event_id, spot!.gathering_spot_id, '08:50', 1)
      .first<{ gathering_id: number }>();
    gatheringIds.push(gathering!.gathering_id);

    return gathering!.gathering_id;
  }

  async function createUser(userName: string) {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(userName)
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

  it('実在しないuser_idsをfindMissingUserIdsで検出する', async () => {
    const user1 = await createUser('実在ユーザー');
    const missingId = user1 + 1_000_000;

    const missing = await repository.findMissingUserIds([user1, missingId]);

    expect(missing).toEqual([missingId]);
  });

  it('applyMemberDiffは追加対象を追加し削除対象を削除する', async () => {
    const gatheringId = await createGathering('差分');
    const user1 = await createUser('削除対象ユーザー');
    const user2 = await createUser('追加対象ユーザー1');
    const user3 = await createUser('追加対象ユーザー2');
    await repository.create(gatheringId, user1);

    const result = await repository.applyMemberDiff(
      gatheringId,
      [user2, user3],
      [user1]
    );

    expect(result.map(m => m.user_id).sort()).toEqual([user2, user3].sort());
    const members = await repository.findByGatheringId(gatheringId);
    expect(members.map(m => m.user_id).sort()).toEqual([user2, user3].sort());
  });

  it('applyMemberDiffは削除対象がなければ参加者を全員削除する', async () => {
    const gatheringId = await createGathering('全削除');
    const user1 = await createUser('削除対象ユーザー');
    await repository.create(gatheringId, user1);

    const result = await repository.applyMemberDiff(gatheringId, [], [user1]);

    expect(result).toEqual([]);
    const members = await repository.findByGatheringId(gatheringId);
    expect(members).toEqual([]);
  });

  it('applyMemberDiffに空の追加・削除を渡すと変更のないメンバーの行を維持する', async () => {
    const gatheringId = await createGathering('冪等性');
    const user1 = await createUser('維持されるユーザー');
    const created = await repository.create(gatheringId, user1);

    const result = await repository.applyMemberDiff(gatheringId, [], []);

    expect(result).toEqual([created]);
    expect(result[0].gathering_group_member_id).toBe(
      created.gathering_group_member_id
    );
    expect(result[0].created_at).toBe(created.created_at);
  });

  it('同一のuser_idsで繰り返しapplyMemberDiffを呼んでも既存メンバーのIDとcreated_atは変わらない', async () => {
    const gatheringId = await createGathering('繰り返し置換');
    const user1 = await createUser('繰り返しユーザー1');
    const user2 = await createUser('繰り返しユーザー2');
    await repository.create(gatheringId, user1);
    await repository.create(gatheringId, user2);

    const before = await repository.findByGatheringId(gatheringId);
    const beforeById = new Map(before.map(m => [m.user_id, m]));

    // 1回目: 現在の参加者(user1, user2)と同じuser_idsを指定するPUTを想定し、
    // 差分計算の結果addUserIds=[], removeUserIds=[]がRepositoryへ渡される。
    await repository.applyMemberDiff(gatheringId, [], []);
    // 2回目も同様に同じuser_idsを繰り返し指定する。
    const after = await repository.applyMemberDiff(gatheringId, [], []);

    expect(after.map(m => m.user_id).sort()).toEqual([user1, user2].sort());
    for (const member of after) {
      const original = beforeById.get(member.user_id);
      expect(member.gathering_group_member_id).toBe(
        original?.gathering_group_member_id
      );
      expect(member.created_at).toBe(original?.created_at);
    }
  });

  it('Serviceで同一user_idsのPUTを繰り返しても、変更のない参加者はIDとcreated_atを維持したままPUTが冪等になる', async () => {
    const gatheringId = await createGathering('Service冪等性');
    const user1 = await createUser('継続参加ユーザー');
    const user2 = await createUser('入れ替え対象ユーザー');
    const service = createGatheringGroupMemberService(repository);

    // 1回目のPUT: [user1, user2] を参加者集合として指定する。
    const firstResult = await service.replaceGatheringMembers(gatheringId, [
      user1,
      user2,
    ]);
    const firstByUserId = new Map(firstResult.map(m => [m.user_id, m]));

    // 2回目のPUT: recwatchが同じuser_idsを再送するケースを想定し、
    // 全く同じ[user1, user2]を指定する。差分がないため、
    // user1・user2ともにgathering_group_member_id・created_atが
    // 変わらないことを期待する(全削除→全挿入だとここでIDが変わってしまう)。
    const secondResult = await service.replaceGatheringMembers(gatheringId, [
      user1,
      user2,
    ]);

    expect(secondResult.map(m => m.user_id).sort()).toEqual(
      [user1, user2].sort()
    );
    for (const member of secondResult) {
      const original = firstByUserId.get(member.user_id);
      expect(member.gathering_group_member_id).toBe(
        original?.gathering_group_member_id
      );
      expect(member.created_at).toBe(original?.created_at);
    }

    // 3回目のPUT: user2をuser3へ入れ替える。user1(変更なし)のIDは維持され、
    // user2は削除、user3のみ新規追加されることを確認する。
    const user3 = await createUser('新規参加ユーザー');
    const thirdResult = await service.replaceGatheringMembers(gatheringId, [
      user1,
      user3,
    ]);

    expect(thirdResult.map(m => m.user_id).sort()).toEqual(
      [user1, user3].sort()
    );
    const keptMember = thirdResult.find(m => m.user_id === user1);
    expect(keptMember?.gathering_group_member_id).toBe(
      firstByUserId.get(user1)?.gathering_group_member_id
    );
    expect(keptMember?.created_at).toBe(firstByUserId.get(user1)?.created_at);
  });
});
