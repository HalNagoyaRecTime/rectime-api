import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createGatheringGroupMemberService } from '../../../src/application/services/GatheringGroupMemberService';
import { createGatheringGroupMemberRepository } from '../../../src/infrastructure/repositories/GatheringGroupMemberRepository';

describe('GatheringGroupMemberRepository', () => {
  const repository = createGatheringGroupMemberRepository(env.DB);

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
      'INSERT INTO events (event_name, start_time, end_time) VALUES (?, ?, ?) RETURNING event_id'
    )
      .bind(`集合メンバーテスト競技-${suffix}`, '0900', '1000')
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

  async function createUser(
    userName: string,
    deletionStatus: 'active' | 'deletion_pending' | 'deleted' = 'active'
  ) {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name, deletion_status) VALUES (?, ?) RETURNING user_id'
    )
      .bind(userName, deletionStatus)
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

  it('退会済み(deletion_status=deleted)のユーザーはfindMissingUserIdsで実在しない扱いにする', async () => {
    // 退会処理(deleteByUserId, #265)でメンバー行を削除済みのユーザーを、
    // PUTでの参加者集合指定によって復活させないための検証。
    const activeUser = await createUser('現役ユーザー');
    const deletedUser = await createUser('退会済みユーザー', 'deleted');

    const missing = await repository.findMissingUserIds([
      activeUser,
      deletedUser,
    ]);

    expect(missing).toEqual([deletedUser]);
  });

  it('削除申請中(deletion_status=deletion_pending)のユーザーもfindMissingUserIdsで実在しない扱いにする', async () => {
    const pendingUser = await createUser(
      '削除申請中ユーザー',
      'deletion_pending'
    );

    const missing = await repository.findMissingUserIds([pendingUser]);

    expect(missing).toEqual([pendingUser]);
  });

  it('applyMemberDiffは追加対象を追加し削除対象を削除する', async () => {
    const gatheringId = await createGathering('差分');
    const user1 = await createUser('削除対象ユーザー');
    const user2 = await createUser('追加対象ユーザー1');
    const user3 = await createUser('追加対象ユーザー2');
    await repository.applyMemberDiff(gatheringId, [user1], []);

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
    await repository.applyMemberDiff(gatheringId, [user1], []);

    const result = await repository.applyMemberDiff(gatheringId, [], [user1]);

    expect(result).toEqual([]);
    const members = await repository.findByGatheringId(gatheringId);
    expect(members).toEqual([]);
  });

  it('applyMemberDiffに空の追加・削除を渡すと変更のないメンバーの行を維持する', async () => {
    const gatheringId = await createGathering('冪等性');
    const user1 = await createUser('維持されるユーザー');
    const [created] = await repository.applyMemberDiff(
      gatheringId,
      [user1],
      []
    );

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
    await repository.applyMemberDiff(gatheringId, [user1, user2], []);

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

  it('同一のaddUserIdsを持つapplyMemberDiffが同時に来てもUNIQUE制約違反で失敗しない', async () => {
    const gatheringId = await createGathering('同時追加');
    const user1 = await createUser('同時追加対象ユーザー');

    // 同じ内容のPUTが同時に来て、両方が同じuserIdを追加対象と判断した
    // 状況を再現する。ON CONFLICT DO NOTHINGにより、後から書いた方が
    // UNIQUE制約(gathering_id, user_id)違反で500にならないことを確認する。
    const results = await Promise.all([
      repository.applyMemberDiff(gatheringId, [user1], []),
      repository.applyMemberDiff(gatheringId, [user1], []),
    ]);

    for (const result of results) {
      expect(result.map(m => m.user_id)).toEqual([user1]);
    }
    const members = await repository.findByGatheringId(gatheringId);
    expect(members.map(m => m.user_id)).toEqual([user1]);
  });

  it('Serviceで退会済みユーザーをuser_idsに含むPUTはUser not foundで拒否し、退会処理で削除済みの参加者行を復活させない', async () => {
    const gatheringId = await createGathering('退会ユーザー拒否');
    const activeUser = await createUser('現役ユーザー');
    const deletedUser = await createUser('退会済みユーザー', 'deleted');
    const service = createGatheringGroupMemberService(repository);

    await expect(
      service.replaceGatheringMembers(gatheringId, [activeUser, deletedUser])
    ).rejects.toThrow('User not found');

    // 拒否された場合は差分反映自体が行われず、参加者が追加されていない
    // ことも併せて確認する。
    const members = await repository.findByGatheringId(gatheringId);
    expect(members).toEqual([]);
  });

  it('findMissingUserIdsでのactive確認後にapplyMemberDiff実行までの間で退会しても、削除済みの参加者行を復活させない', async () => {
    const gatheringId = await createGathering('TOCTOU競合');
    const activeUser = await createUser('現役ユーザー');
    const raceUser = await createUser('競合ユーザー');

    // replaceGatheringMembersのfindMissingUserIdsでのactive確認が
    // 通った直後を模す: applyMemberDiff呼び出し時点では、その間に
    // 退会処理(deleteByUserId)が完了しdeletion_status='deleted'に
    // なっているケース。
    await env.DB.prepare(
      "UPDATE users SET deletion_status = 'deleted' WHERE user_id = ?"
    )
      .bind(raceUser)
      .run();

    const result = await repository.applyMemberDiff(
      gatheringId,
      [activeUser, raceUser],
      []
    );

    // 書き込み時点でのactive確認により、退会済みユーザーはサイレントに
    // 追加対象から除外される。
    expect(result.map(m => m.user_id)).toEqual([activeUser]);
    const members = await repository.findByGatheringId(gatheringId);
    expect(members.map(m => m.user_id)).toEqual([activeUser]);
  });

  it('applyMemberDiff実行前に集合が削除されると、FOREIGN KEY制約違反の素の例外が発生する(Serviceでの変換対象を確認する)', async () => {
    const gatheringId = await createGathering('集合削除競合-repo');
    const user1 = await createUser('参加予定ユーザー-repo');

    // ensureGatheringExistsでの存在確認が通った直後、applyMemberDiff
    // 実行までの間に集合自体が削除される競合を再現する。
    await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
      .bind(gatheringId)
      .run();
    gatheringIds = gatheringIds.filter(id => id !== gatheringId);

    // Repositoryはこの競合を検知・変換せず、gathering_group_members.
    // gathering_idの外部キー制約違反という素の例外をそのまま投げる。
    // Service層(replaceGatheringMembers)がこれをcatchし、現在の状態を
    // 再確認してGathering not foundへ変換する。
    await expect(
      repository.applyMemberDiff(gatheringId, [user1], [])
    ).rejects.toThrow(/Failed query: insert into "gathering_group_members"/);
  });

  it('ServiceでensureGatheringExists通過後に集合が削除されると、FK違反の素の例外ではなくGathering not foundへ変換される', async () => {
    const gatheringId = await createGathering('集合削除競合-service');
    const user1 = await createUser('参加予定ユーザー-service');

    // repositoryをラップし、Serviceがreplace処理の一環として最初に呼ぶ
    // findByGatheringId(現在の参加者取得、ensureGatheringExists通過後)の
    // 直後に集合を削除することで、「存在確認は通過したが、その後の
    // applyMemberDiff実行までの間に削除される」レースを正確に再現する。
    const racyRepository: typeof repository = {
      ...repository,
      async findByGatheringId(id) {
        const result = await repository.findByGatheringId(id);
        await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
          .bind(gatheringId)
          .run();
        gatheringIds = gatheringIds.filter(gid => gid !== gatheringId);
        return result;
      },
    };
    const service = createGatheringGroupMemberService(racyRepository);

    await expect(
      service.replaceGatheringMembers(gatheringId, [user1])
    ).rejects.toThrow('Gathering not found');
  });
});
