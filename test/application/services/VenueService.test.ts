import { describe, expect, it, vi } from 'vitest';
import { createVenueService } from '../../../src/application/services/VenueService';
import type { IVenueRepository } from '../../../src/domain/interfaces/repositories/IVenueRepository';

function setup(overrides: Partial<IVenueRepository> = {}) {
  const repository: IVenueRepository = {
    findAll: vi.fn(),
    findExistingIds: vi.fn(),
    findPage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hasEvents: vi.fn().mockResolvedValue(false),
    findImageKey: vi.fn().mockResolvedValue({ imageKey: null }),
    replaceImageKey: vi.fn(),
    ...overrides,
  };
  const deleteUnusedImage = vi.fn();
  return {
    repository,
    deleteUnusedImage,
    service: createVenueService(repository, deleteUnusedImage, {
      sign: async (key: string) => `https://signed.example/${key}`,
    }),
  };
}

describe('VenueService', () => {
  it('一覧・ページの実施場所を、画像のURLに変換して返す', async () => {
    const venue = {
      venue_id: 1,
      venue_name: '第1体育館',
      image_key: 'venues/1/a.png',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    const expected = {
      venue_id: 1,
      venue_name: '第1体育館',
      image_url: 'https://signed.example/venues/1/a.png',
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    const { service } = setup({
      findAll: vi.fn().mockResolvedValue([venue]),
      findPage: vi
        .fn()
        .mockResolvedValue({ venues: [venue], total: 1, limit: 20, offset: 0 }),
    });

    await expect(service.getAllVenues()).resolves.toEqual([expected]);
    await expect(
      service.getVenuePage({ limit: 20, offset: 0 })
    ).resolves.toEqual({ venues: [expected], total: 1, limit: 20, offset: 0 });
  });

  it('一覧取得をリポジトリへ委譲する', async () => {
    const { repository, service } = setup({
      findAll: vi.fn().mockResolvedValue([]),
    });

    await service.getAllVenues();

    expect(repository.findAll).toHaveBeenCalled();
  });

  it('名前が重複した作成を Venue name already exists に変換する', async () => {
    const { service } = setup({
      create: vi
        .fn()
        .mockRejectedValue(
          new Error('UNIQUE constraint failed: venues.venue_name')
        ),
    });

    await expect(service.createVenue('第1体育館')).rejects.toThrow(
      'Venue name already exists'
    );
  });

  it('cause に包まれた UNIQUE 違反も Venue name already exists に変換する', async () => {
    const { service } = setup({
      update: vi.fn().mockRejectedValue(
        new Error('D1_ERROR', {
          cause: new Error('UNIQUE constraint failed: venues.venue_name'),
        })
      ),
    });

    await expect(
      service.updateVenue(1, { venue_name: '第1体育館' })
    ).rejects.toThrow('Venue name already exists');
  });

  it('更新対象が無ければ Venue not found を投げる', async () => {
    const { service } = setup({ update: vi.fn().mockResolvedValue(null) });

    await expect(
      service.updateVenue(1, { venue_name: '第1体育館' })
    ).rejects.toThrow('Venue not found');
  });

  it('競技から参照されている実施場所は削除せず Venue is in use を投げる', async () => {
    const { repository, service } = setup({
      hasEvents: vi.fn().mockResolvedValue(true),
    });

    await expect(service.deleteVenue(1)).rejects.toThrow('Venue is in use');
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('削除時の FOREIGN KEY 違反も Venue is in use に変換する', async () => {
    const { service } = setup({
      delete: vi
        .fn()
        .mockRejectedValue(new Error('FOREIGN KEY constraint failed')),
    });

    await expect(service.deleteVenue(1)).rejects.toThrow('Venue is in use');
  });

  it('削除対象が無ければ Venue not found を投げる', async () => {
    const { service } = setup({ delete: vi.fn().mockResolvedValue(false) });

    await expect(service.deleteVenue(1)).rejects.toThrow('Venue not found');
  });

  it('画像のある実施場所を削除すると、その画像を不要になった画像として削除する', async () => {
    const { deleteUnusedImage, service } = setup({
      delete: vi.fn().mockResolvedValue(true),
      findImageKey: vi
        .fn()
        .mockResolvedValue({ imageKey: 'venues/1/old.webp' }),
    });

    await service.deleteVenue(1);

    expect(deleteUnusedImage).toHaveBeenCalledWith('venues/1/old.webp');
  });

  it('削除できなかった実施場所の画像は保存先に残す', async () => {
    const { deleteUnusedImage, service } = setup({
      delete: vi.fn().mockResolvedValue(false),
      findImageKey: vi
        .fn()
        .mockResolvedValue({ imageKey: 'venues/1/old.webp' }),
    });

    await expect(service.deleteVenue(1)).rejects.toThrow('Venue not found');
    expect(deleteUnusedImage).not.toHaveBeenCalled();
  });
});
