import { describe, expect, it, vi } from 'vitest';
import { createVenueService } from '../../../src/application/services/VenueService';
import type { IVenueRepository } from '../../../src/domain/interfaces/repositories/IVenueRepository';

function setup(overrides: Partial<IVenueRepository> = {}) {
  const repository: IVenueRepository = {
    findAll: vi.fn(),
    findPage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    hasEvents: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
  return { repository, service: createVenueService(repository) };
}

describe('VenueService', () => {
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
});
