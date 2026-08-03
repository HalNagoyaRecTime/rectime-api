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
      findAll: vi.fn().mockResolvedValue([spot]),
      create: vi.fn().mockResolvedValue(spot),
      update: vi.fn(),
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
      findAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(updatedSpot),
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
  });

  it('集合対象者の追加・一覧取得・解除をRepositoryへ委譲する', async () => {
    const member = {
      gathering_group_member_id: 3,
      gathering_id: 1,
      user_id: 2,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    const repository: IGatheringGroupMemberRepository = {
      existsGathering: vi.fn().mockResolvedValue(true),
      existsUser: vi.fn().mockResolvedValue(true),
      findByGatheringId: vi.fn().mockResolvedValue([member]),
      create: vi.fn().mockResolvedValue(member),
      remove: vi.fn().mockResolvedValue(true),
    };
    const service = createGatheringGroupMemberService(repository);

    await expect(service.addGatheringMember(1, 2)).resolves.toBe(member);
    await expect(service.getGatheringMembers(1)).resolves.toEqual([member]);
    await expect(service.removeGatheringMember(1, 2)).resolves.toBe(true);

    expect(repository.existsGathering).toHaveBeenCalledTimes(2);
    expect(repository.existsUser).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(1, 2);
    expect(repository.findByGatheringId).toHaveBeenCalledWith(1);
    expect(repository.remove).toHaveBeenCalledWith(1, 2);
  });

  it('存在しない集合または利用者は追加前にエラーにする', async () => {
    const repository: IGatheringGroupMemberRepository = {
      existsGathering: vi.fn().mockResolvedValue(false),
      existsUser: vi.fn().mockResolvedValue(false),
      create: vi.fn(),
    } as unknown as IGatheringGroupMemberRepository;
    const service = createGatheringGroupMemberService(repository);

    await expect(service.getGatheringMembers(1)).rejects.toThrow(
      'Gathering not found'
    );
    await expect(service.addGatheringMember(1, 2)).rejects.toThrow(
      'Gathering not found'
    );
    expect(repository.create).not.toHaveBeenCalled();

    (repository.existsGathering as ReturnType<typeof vi.fn>).mockResolvedValue(
      true
    );
    await expect(service.addGatheringMember(1, 2)).rejects.toThrow(
      'User not found'
    );
  });

  it('存在確認後に集合が削除された場合は追加時の外部キーエラーを404用エラーへ変換する', async () => {
    const repository: IGatheringGroupMemberRepository = {
      existsGathering: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
      existsUser: vi.fn().mockResolvedValue(true),
      create: vi.fn().mockRejectedValue(new Error('FOREIGN KEY constraint')),
    } as unknown as IGatheringGroupMemberRepository;

    await expect(
      createGatheringGroupMemberService(repository).addGatheringMember(1, 2)
    ).rejects.toThrow('Gathering not found');
    expect(repository.create).toHaveBeenCalledWith(1, 2);
    expect(repository.existsGathering).toHaveBeenCalledTimes(2);
  });

  it('存在しない集合対象者の解除はエラーにする', async () => {
    const repository: IGatheringGroupMemberRepository = {
      existsGathering: vi.fn().mockResolvedValue(true),
      existsUser: vi.fn().mockResolvedValue(true),
      remove: vi.fn().mockResolvedValue(false),
    } as unknown as IGatheringGroupMemberRepository;

    await expect(
      createGatheringGroupMemberService(repository).removeGatheringMember(1, 2)
    ).rejects.toThrow('Gathering member not found');
  });

  it('所属解除でRepositoryの例外をそのまま送出する', async () => {
    const repository: IGatheringGroupMemberRepository = {
      remove: vi.fn().mockRejectedValue(new Error('database error')),
    } as unknown as IGatheringGroupMemberRepository;

    await expect(
      createGatheringGroupMemberService(repository).removeGatheringMember(1, 2)
    ).rejects.toThrow('database error');
  });
});
