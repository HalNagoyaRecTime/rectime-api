import { describe, expect, it, vi } from 'vitest';
import { createGatheringGroupMemberService } from '../../../src/application/services/GatheringGroupMemberService';
import { createGatheringSpotService } from '../../../src/application/services/GatheringSpotService';
import type { IGatheringGroupMemberRepository } from '../../../src/domain/interfaces/repositories/IGatheringGroupMemberRepository';
import type { IGatheringSpotRepository } from '../../../src/domain/interfaces/repositories/IGatheringSpotRepository';

describe('Gathering master services', () => {
  it('集合場所の作成・一覧取得結果をRepositoryから返す', async () => {
    const spot = {
      gathering_spot_id: 1,
      gathering_spot_name: '体育館前',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    const repository: IGatheringSpotRepository = {
      exists: vi.fn(),
      findExistingIds: vi.fn(),
      findAll: vi.fn().mockResolvedValue([spot]),
      findPage: vi.fn(),
      create: vi.fn().mockResolvedValue(spot),
      update: vi.fn(),
      delete: vi.fn(),
      hasGatherings: vi.fn(),
    };
    const service = createGatheringSpotService(repository);

    await expect(service.createGatheringSpot('体育館前')).resolves.toBe(spot);
    await expect(service.getAllGatheringSpots()).resolves.toEqual([spot]);
  });

  it('集合場所の更新をIDと入力値ごとRepositoryへ委譲する', async () => {
    const updatedSpot = {
      gathering_spot_id: 1,
      gathering_spot_name: '正門前',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-02 00:00:00',
    };
    const repository: IGatheringSpotRepository = {
      exists: vi.fn(),
      findExistingIds: vi.fn(),
      findAll: vi.fn(),
      findPage: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(updatedSpot),
      delete: vi.fn(),
      hasGatherings: vi.fn(),
    };
    const service = createGatheringSpotService(repository);
    const input = { gathering_spot_name: '正門前' };

    await expect(service.updateGatheringSpot(1, input)).resolves.toBe(
      updatedSpot
    );
    expect(repository.update).toHaveBeenCalledWith(1, input);
  });

  it('集合場所の更新対象が存在しない場合はエラーにする', async () => {
    const repository: IGatheringSpotRepository = {
      exists: vi.fn(),
      findExistingIds: vi.fn(),
      findAll: vi.fn(),
      findPage: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
      hasGatherings: vi.fn(),
    };
    const service = createGatheringSpotService(repository);

    await expect(
      service.updateGatheringSpot(999, {
        gathering_spot_name: '正門前',
      })
    ).rejects.toThrow('Gathering spot not found');
  });

  it('未使用の集合場所を削除する', async () => {
    const repository: IGatheringSpotRepository = {
      exists: vi.fn(),
      findExistingIds: vi.fn(),
      findAll: vi.fn(),
      findPage: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
      hasGatherings: vi.fn().mockResolvedValue(false),
    };
    const service = createGatheringSpotService(repository);

    await expect(service.deleteGatheringSpot(1)).resolves.toBeUndefined();
    expect(repository.delete).toHaveBeenCalledWith(1);
  });

  it('利用中の集合場所は削除せず409用エラーにする', async () => {
    const repository: IGatheringSpotRepository = {
      exists: vi.fn(),
      findExistingIds: vi.fn(),
      findAll: vi.fn(),
      findPage: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      hasGatherings: vi.fn().mockResolvedValue(true),
    };
    const service = createGatheringSpotService(repository);

    await expect(service.deleteGatheringSpot(1)).rejects.toThrow(
      'Gathering spot is in use'
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('集合対象者の一覧取得と一括置換をRepositoryへ委譲する', async () => {
    const member = {
      gathering_group_member_id: 3,
      gathering_id: 1,
      user_id: 2,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    const repository: IGatheringGroupMemberRepository = {
      existsGathering: vi.fn().mockResolvedValue(true),
      findByGatheringId: vi.fn().mockResolvedValue([member]),
      findMissingUserIds: vi.fn().mockResolvedValue([]),
      applyMemberDiff: vi.fn().mockResolvedValue([member]),
      deleteByUserId: vi.fn(),
    };
    const service = createGatheringGroupMemberService(repository);

    await expect(service.getGatheringMembers(1)).resolves.toEqual([member]);
    // 現在の参加者(user_id: 2)と同じuser_idsを渡すため、差分は空になる。
    await expect(service.replaceGatheringMembers(1, [2])).resolves.toEqual([
      member,
    ]);

    expect(repository.existsGathering).toHaveBeenCalledTimes(2);
    expect(repository.findByGatheringId).toHaveBeenCalledWith(1);
    expect(repository.findMissingUserIds).toHaveBeenCalledWith([2]);
    // 差分が空(無変更の冪等な再送)の場合、直前のfindByGatheringIdの
    // 結果をそのまま返しapplyMemberDiffの呼び出し自体を省略する。
    expect(repository.applyMemberDiff).not.toHaveBeenCalled();
  });

  it('参加者集合の一括置換は現在の参加者との差分だけをRepositoryへ渡す', async () => {
    const keep = { user_id: 1 };
    const toRemove = { user_id: 2 };
    const currentMembers = [
      {
        gathering_group_member_id: 10,
        gathering_id: 1,
        user_id: keep.user_id,
        created_at: '2026-01-01 00:00:00',
        updated_at: '2026-01-01 00:00:00',
      },
      {
        gathering_group_member_id: 11,
        gathering_id: 1,
        user_id: toRemove.user_id,
        created_at: '2026-01-01 00:00:00',
        updated_at: '2026-01-01 00:00:00',
      },
    ];
    const repository: IGatheringGroupMemberRepository = {
      existsGathering: vi.fn().mockResolvedValue(true),
      findByGatheringId: vi.fn().mockResolvedValue(currentMembers),
      findMissingUserIds: vi.fn().mockResolvedValue([]),
      applyMemberDiff: vi.fn().mockResolvedValue(currentMembers),
      deleteByUserId: vi.fn(),
    };
    const service = createGatheringGroupMemberService(repository);

    // 現在: [1, 2] → 指定: [1, 3] なので、追加は3のみ、削除は2のみになる。
    await service.replaceGatheringMembers(1, [keep.user_id, 3]);

    expect(repository.applyMemberDiff).toHaveBeenCalledWith(
      1,
      [3],
      [toRemove.user_id]
    );
  });

  it('存在しない集合は一覧取得前にエラーにする', async () => {
    const repository: IGatheringGroupMemberRepository = {
      existsGathering: vi.fn().mockResolvedValue(false),
    } as unknown as IGatheringGroupMemberRepository;
    const service = createGatheringGroupMemberService(repository);

    await expect(service.getGatheringMembers(1)).rejects.toThrow(
      'Gathering not found'
    );
  });
});
