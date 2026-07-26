import { describe, expect, it, vi } from 'vitest';
import { createGatheringGroupMemberService } from '../../../src/application/services/GatheringGroupMemberService';
import { createGatheringGroupService } from '../../../src/application/services/GatheringGroupService';
import { createGatheringSpotService } from '../../../src/application/services/GatheringSpotService';
import type { IGatheringGroupMemberRepository } from '../../../src/domain/interfaces/repositories/IGatheringGroupMemberRepository';
import type { IGatheringGroupRepository } from '../../../src/domain/interfaces/repositories/IGatheringGroupRepository';
import type { IGatheringSpotRepository } from '../../../src/domain/interfaces/repositories/IGatheringSpotRepository';

describe('Gathering master services', () => {
  it('集合場所と集合グループの作成・一覧取得結果をRepositoryからそのまま返す', async () => {
    const spot = {
      gathering_spot_id: 1,
      gathering_spot_name: '体育館前',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    const group = {
      gathering_group_id: 2,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    const spots = [spot];
    const groups = [group];
    const gatheringSpotRepository: IGatheringSpotRepository = {
      findAll: vi.fn().mockResolvedValue(spots),
      create: vi.fn().mockResolvedValue(spot),
      update: vi.fn(),
    };
    const gatheringGroupRepository: IGatheringGroupRepository = {
      findAll: vi.fn().mockResolvedValue(groups),
      create: vi.fn().mockResolvedValue(group),
      exists: vi.fn().mockResolvedValue(true),
      hasGathering: vi.fn().mockResolvedValue(false),
      remove: vi.fn().mockResolvedValue(true),
    };
    const gatheringSpotService = createGatheringSpotService(
      gatheringSpotRepository
    );
    const gatheringGroupService = createGatheringGroupService(
      gatheringGroupRepository
    );

    await expect(
      gatheringSpotService.createGatheringSpot('体育館前')
    ).resolves.toBe(spot);
    await expect(gatheringSpotService.getAllGatheringSpots()).resolves.toBe(
      spots
    );
    await expect(gatheringGroupService.createGatheringGroup()).resolves.toEqual(
      group
    );
    await expect(
      gatheringGroupService.getAllGatheringGroups()
    ).resolves.toEqual(groups);

    expect(gatheringSpotRepository.create).toHaveBeenCalledWith('体育館前');
    expect(gatheringSpotRepository.findAll).toHaveBeenCalledOnce();
    expect(gatheringGroupRepository.create).toHaveBeenCalledWith();
    expect(gatheringGroupRepository.findAll).toHaveBeenCalledOnce();
  });

  it('集合場所の更新をIDと入力値ごとRepositoryへ委譲する', async () => {
    const updatedSpot = {
      gathering_spot_id: 1,
      gathering_spot_name: '正門前',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-02 00:00:00',
    };
    const repository: IGatheringSpotRepository = {
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(updatedSpot),
    };
    const service = createGatheringSpotService(repository);
    const input = { gathering_spot_name: '正門前' };

    await expect(service.updateGatheringSpot(1, input)).resolves.toBe(
      updatedSpot
    );
    expect(repository.update).toHaveBeenCalledOnce();
    expect(repository.update).toHaveBeenCalledWith(1, input);
  });

  it('集合場所の更新対象が存在しない場合はエラーを送出する', async () => {
    const repository: IGatheringSpotRepository = {
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(null),
    };
    const service = createGatheringSpotService(repository);

    await expect(
      service.updateGatheringSpot(999, {
        gathering_spot_name: '正門前',
      })
    ).rejects.toThrow('Gathering spot not found');
    expect(repository.update).toHaveBeenCalledWith(999, {
      gathering_spot_name: '正門前',
    });
  });

  it('イベントに未紐付けの集合グループを削除する', async () => {
    const repository: IGatheringGroupRepository = {
      findAll: vi.fn(),
      create: vi.fn(),
      exists: vi.fn().mockResolvedValue(true),
      hasGathering: vi.fn().mockResolvedValue(false),
      remove: vi.fn().mockResolvedValue(true),
    };
    const service = createGatheringGroupService(repository);

    await expect(service.deleteGatheringGroup(1)).resolves.toBeUndefined();
    expect(repository.remove).toHaveBeenCalledWith(1);
  });

  it('イベントに紐付く集合グループは削除しない', async () => {
    const repository: IGatheringGroupRepository = {
      findAll: vi.fn(),
      create: vi.fn(),
      exists: vi.fn().mockResolvedValue(true),
      hasGathering: vi.fn().mockResolvedValue(true),
      remove: vi.fn(),
    };
    const service = createGatheringGroupService(repository);

    await expect(service.deleteGatheringGroup(1)).rejects.toThrow(
      'Gathering group is assigned to an event'
    );
    expect(repository.hasGathering).toHaveBeenCalledWith(1);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('所属の追加・一覧取得・解除をRepositoryへ委譲する', async () => {
    const member = {
      gathering_group_member_id: 3,
      gathering_group_id: 1,
      user_id: 2,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    const members = [member];
    const repository: IGatheringGroupMemberRepository = {
      existsGatheringGroup: vi.fn().mockResolvedValue(true),
      existsUser: vi.fn().mockResolvedValue(true),
      findByGatheringGroupId: vi.fn().mockResolvedValue(members),
      create: vi.fn().mockResolvedValue(member),
      remove: vi.fn().mockResolvedValue(true),
    };
    const service = createGatheringGroupMemberService(repository);

    await expect(
      service.addGatheringGroupMember(1, { userId: 2 })
    ).resolves.toEqual(member);
    await expect(service.getGatheringGroupMembers(1)).resolves.toEqual(members);
    await expect(service.removeGatheringGroupMember(1, 2)).resolves.toBe(true);

    expect(repository.existsGatheringGroup).toHaveBeenCalledTimes(3);
    expect(repository.existsUser).toHaveBeenCalledTimes(2);
    expect(repository.create).toHaveBeenCalledWith(1, 2);
    expect(repository.findByGatheringGroupId).toHaveBeenCalledWith(1);
    expect(repository.remove).toHaveBeenCalledWith(1, 2);
  });

  it('所属解除でRepositoryの例外をそのまま送出する', async () => {
    const repository: IGatheringGroupMemberRepository = {
      existsGatheringGroup: vi.fn().mockResolvedValue(true),
      existsUser: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockRejectedValue(new Error('database error')),
    } as unknown as IGatheringGroupMemberRepository;

    await expect(
      createGatheringGroupMemberService(repository).removeGatheringGroupMember(
        1,
        2
      )
    ).rejects.toThrow('database error');
  });

  it('存在しないグループまたはユーザーは作成前にエラーにする', async () => {
    const repository: IGatheringGroupMemberRepository = {
      existsGatheringGroup: vi.fn().mockResolvedValue(false),
      existsUser: vi.fn().mockResolvedValue(false),
      create: vi.fn(),
    } as unknown as IGatheringGroupMemberRepository;
    const service = createGatheringGroupMemberService(repository);

    await expect(service.getGatheringGroupMembers(1)).rejects.toThrow(
      'Gathering group not found'
    );
    await expect(
      service.addGatheringGroupMember(1, { userId: 2 })
    ).rejects.toThrow('Gathering group not found');
    expect(repository.create).not.toHaveBeenCalled();

    (
      repository.existsGatheringGroup as ReturnType<typeof vi.fn>
    ).mockResolvedValue(true);
    await expect(
      service.addGatheringGroupMember(1, { userId: 2 })
    ).rejects.toThrow('User not found');
    expect(repository.create).not.toHaveBeenCalled();
  });
});
