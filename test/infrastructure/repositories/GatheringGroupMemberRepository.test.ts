import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
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

  it('display_nameを含む参加者一覧をgathering_group_member_id順に返す', async () => {
    const gatheringId = await createGathering('一覧');
    const user1 = await createUser('山田 太郎');
    const user2 = await createUser('山田 花子');
    await repository.create(gatheringId, user1);
    await repository.create(gatheringId, user2);

    const members =
      await repository.findMemberSummariesByGatheringId(gatheringId);

    expect(members).toEqual([
      { user_id: user1, display_name: '山田 太郎' },
      { user_id: user2, display_name: '山田 花子' },
    ]);
  });

  it('実在しないuser_idsをfindMissingUserIdsで検出する', async () => {
    const user1 = await createUser('実在ユーザー');
    const missingId = user1 + 1_000_000;

    const missing = await repository.findMissingUserIds([user1, missingId]);

    expect(missing).toEqual([missingId]);
  });

  it('replaceMembersで参加者集合を一括置換する', async () => {
    const gatheringId = await createGathering('置換');
    const user1 = await createUser('置換前ユーザー');
    const user2 = await createUser('置換後ユーザー1');
    const user3 = await createUser('置換後ユーザー2');
    await repository.create(gatheringId, user1);

    const result = await repository.replaceMembers(gatheringId, [user2, user3]);

    expect(result).toEqual([
      { user_id: user2, display_name: '置換後ユーザー1' },
      { user_id: user3, display_name: '置換後ユーザー2' },
    ]);
    const members =
      await repository.findMemberSummariesByGatheringId(gatheringId);
    expect(members.map(m => m.user_id).sort()).toEqual([user2, user3].sort());
  });

  it('replaceMembersに空配列を渡すと参加者を全員削除する', async () => {
    const gatheringId = await createGathering('全削除');
    const user1 = await createUser('削除対象ユーザー');
    await repository.create(gatheringId, user1);

    const result = await repository.replaceMembers(gatheringId, []);

    expect(result).toEqual([]);
    const members =
      await repository.findMemberSummariesByGatheringId(gatheringId);
    expect(members).toEqual([]);
  });
});
