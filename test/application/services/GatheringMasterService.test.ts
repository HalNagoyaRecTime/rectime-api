import { describe, expect, it, vi } from 'vitest';
import { createGatheringGroupMemberService } from '../../../src/application/services/GatheringGroupMemberService';
import { createGatheringSpotService } from '../../../src/application/services/GatheringSpotService';
import type { IGatheringGroupMemberRepository } from '../../../src/domain/interfaces/repositories/IGatheringGroupMemberRepository';
import type { IGatheringSpotRepository } from '../../../src/domain/interfaces/repositories/IGatheringSpotRepository';

const imageUrlSigner = {
  sign: async (key: string) => `https://signed.example/${key}`,
};

const deleteUnusedImage = vi.fn();

describe('Gathering master services', () => {
  it('集合場所の作成・一覧取得結果を、画像のURLに変換して返す', async () => {
    const spot = {
      gathering_spot_id: 1,
      gathering_spot_name: '体育館前',
      image_key: 'gathering-spots/1/a.png',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
      lock_version: 3,
    };
    const expected = {
      gathering_spot_id: 1,
      gathering_spot_name: '体育館前',
      image_url: 'https://signed.example/gathering-spots/1/a.png',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
      lock_version: 3,
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
      findImageKey: vi.fn().mockResolvedValue({ imageKey: null }),
      replaceImageKey: vi.fn(),
    };
    const service = createGatheringSpotService(
      repository,
      deleteUnusedImage,
      imageUrlSigner
    );

    await expect(service.createGatheringSpot('体育館前')).resolves.toEqual(
      expected
    );
    await expect(service.getAllGatheringSpots()).resolves.toEqual([expected]);
  });

  it('集合場所の更新をIDと入力値ごとRepositoryへ委譲する', async () => {
    const updatedSpot = {
      gathering_spot_id: 1,
      gathering_spot_name: '正門前',
      image_key: null,
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
      findImageKey: vi.fn().mockResolvedValue({ imageKey: null }),
      replaceImageKey: vi.fn(),
    };
    const service = createGatheringSpotService(
      repository,
      deleteUnusedImage,
      imageUrlSigner
    );
    const input = { gathering_spot_name: '正門前' };

    await expect(service.updateGatheringSpot(1, input)).resolves.toEqual({
      gathering_spot_id: 1,
      gathering_spot_name: '正門前',
      image_url: null,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-02 00:00:00',
    });
    expect(repository.update).toHaveBeenCalledWith(1, input);
  });

  describe('集合場所の更新の楽観ロック', () => {
    const setup = (overrides: Partial<IGatheringSpotRepository>) => {
      const repository: IGatheringSpotRepository = {
        exists: vi.fn(),
        findExistingIds: vi.fn(),
        findAll: vi.fn(),
        findPage: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
        hasGatherings: vi.fn(),
        findImageKey: vi.fn(),
        replaceImageKey: vi.fn(),
        ...overrides,
      };
      return {
        repository,
        service: createGatheringSpotService(
          repository,
          deleteUnusedImage,
          imageUrlSigner
        ),
      };
    };

    it('lock_version を指定した更新が0件で、行が残っていれば競合として扱う', async () => {
      const { repository, service } = setup({
        exists: vi.fn().mockResolvedValue(true),
      });

      await expect(
        service.updateGatheringSpot(1, {
          gathering_spot_name: '正門前',
          expected_lock_version: 2,
        })
      ).rejects.toThrow('Gathering spot update conflict');
      expect(repository.exists).toHaveBeenCalledWith(1);
    });

    it('lock_version を指定した更新が0件で、行も無ければ見つからないとして扱う', async () => {
      const { service } = setup({
        exists: vi.fn().mockResolvedValue(false),
      });

      await expect(
        service.updateGatheringSpot(1, {
          gathering_spot_name: '正門前',
          expected_lock_version: 2,
        })
      ).rejects.toThrow('Gathering spot not found');
    });

    it('lock_version を指定しない更新は、0件でも行の有無を確認せず見つからないとして扱う', async () => {
      const { repository, service } = setup({});

      await expect(
        service.updateGatheringSpot(1, { gathering_spot_name: '正門前' })
      ).rejects.toThrow('Gathering spot not found');
      expect(repository.exists).not.toHaveBeenCalled();
    });
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
      findImageKey: vi.fn().mockResolvedValue({ imageKey: null }),
      replaceImageKey: vi.fn(),
    };
    const service = createGatheringSpotService(
      repository,
      deleteUnusedImage,
      imageUrlSigner
    );

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
      findImageKey: vi.fn().mockResolvedValue({ imageKey: null }),
      replaceImageKey: vi.fn(),
    };
    const service = createGatheringSpotService(
      repository,
      deleteUnusedImage,
      imageUrlSigner
    );

    await expect(service.deleteGatheringSpot(1)).resolves.toBeUndefined();
    expect(repository.delete).toHaveBeenCalledWith(1);
  });

  it('画像のある集合場所を削除すると、その画像を不要になった画像として削除する', async () => {
    const repository: IGatheringSpotRepository = {
      exists: vi.fn(),
      findExistingIds: vi.fn(),
      findAll: vi.fn(),
      findPage: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
      hasGatherings: vi.fn().mockResolvedValue(false),
      findImageKey: vi
        .fn()
        .mockResolvedValue({ imageKey: 'gathering-spots/1/old.webp' }),
      replaceImageKey: vi.fn(),
    };
    const deleteImage = vi.fn();
    const service = createGatheringSpotService(
      repository,
      deleteImage,
      imageUrlSigner
    );

    await service.deleteGatheringSpot(1);

    expect(deleteImage).toHaveBeenCalledWith('gathering-spots/1/old.webp');
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
      findImageKey: vi.fn().mockResolvedValue({ imageKey: null }),
      replaceImageKey: vi.fn(),
    };
    const service = createGatheringSpotService(
      repository,
      deleteUnusedImage,
      imageUrlSigner
    );

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
