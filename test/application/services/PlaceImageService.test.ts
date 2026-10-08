import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PLACE_IMAGE_BYTES,
  createPlaceImageService,
} from '../../../src/application/services/PlaceImageService';
import type { IGatheringSpotRepository } from '../../../src/domain/interfaces/repositories/IGatheringSpotRepository';
import type { IVenueRepository } from '../../../src/domain/interfaces/repositories/IVenueRepository';
import type { IImageStorage } from '../../../src/domain/interfaces/storages/IImageStorage';

function setup(found: { imageKey: string | null } | null = { imageKey: null }) {
  const venueRepository = {
    findImageKey: vi.fn().mockResolvedValue(found),
    updateImageKey: vi.fn(),
  } as unknown as IVenueRepository;
  const gatheringSpotRepository = {
    findImageKey: vi.fn().mockResolvedValue(found),
    updateImageKey: vi.fn(),
  } as unknown as IGatheringSpotRepository;
  const imageStorage: IImageStorage = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return {
    venueRepository,
    gatheringSpotRepository,
    imageStorage,
    service: createPlaceImageService(
      imageStorage,
      venueRepository,
      gatheringSpotRepository
    ),
  };
}

const pngImage = { body: new ArrayBuffer(3), contentType: 'image/png' };

describe('PlaceImageService', () => {
  it('紐づいている画像を保存先から取り出す', async () => {
    const { imageStorage, service } = setup({ imageKey: 'venues/1/a.png' });
    const stored = { body: new ReadableStream(), contentType: 'image/png' };
    vi.mocked(imageStorage.get).mockResolvedValue(stored);

    await expect(service.getVenueImage(1)).resolves.toBe(stored);
    expect(imageStorage.get).toHaveBeenCalledWith('venues/1/a.png');
  });

  it.each([
    ['画像が無い場所', { imageKey: null }],
    ['存在しない場所', null],
  ])('%sの画像は null を返す', async (_, found) => {
    const { imageStorage, service } = setup(found);

    await expect(service.getGatheringSpotImage(2)).resolves.toBeNull();
    expect(imageStorage.get).not.toHaveBeenCalled();
  });

  it('実施場所の画像を保存し、新しいキーを紐づける', async () => {
    const { venueRepository, imageStorage, service } = setup();

    await service.setVenueImage(1, pngImage);

    const key = vi.mocked(imageStorage.put).mock.calls[0][0];
    expect(key).toMatch(/^venues\/1\/[0-9a-f-]+\.png$/);
    expect(imageStorage.put).toHaveBeenCalledWith(
      key,
      pngImage.body,
      'image/png'
    );
    expect(venueRepository.updateImageKey).toHaveBeenCalledWith(1, key);
  });

  it('集合場所の画像は gathering-spots 配下に保存する', async () => {
    const { gatheringSpotRepository, imageStorage, service } = setup();

    await service.setGatheringSpotImage(2, {
      body: new ArrayBuffer(3),
      contentType: 'image/jpeg',
    });

    const key = vi.mocked(imageStorage.put).mock.calls[0][0];
    expect(key).toMatch(/^gathering-spots\/2\/[0-9a-f-]+\.jpg$/);
    expect(gatheringSpotRepository.updateImageKey).toHaveBeenCalledWith(2, key);
  });

  it('差し替えると、前の画像を保存先から削除する', async () => {
    const { imageStorage, service } = setup({ imageKey: 'venues/1/old.png' });

    await service.setVenueImage(1, pngImage);

    expect(imageStorage.delete).toHaveBeenCalledWith('venues/1/old.png');
  });

  it.each([
    [
      '対応していない形式',
      { body: new ArrayBuffer(3), contentType: 'image/gif' },
    ],
    ['空のファイル', { body: new ArrayBuffer(0), contentType: 'image/png' }],
    [
      '5MBを超えるファイル',
      {
        body: new ArrayBuffer(MAX_PLACE_IMAGE_BYTES + 1),
        contentType: 'image/png',
      },
    ],
  ])('%sは保存せず Invalid image を投げる', async (_, image) => {
    const { imageStorage, service } = setup();

    await expect(service.setVenueImage(1, image)).rejects.toThrow(
      'Invalid image'
    );
    expect(imageStorage.put).not.toHaveBeenCalled();
  });

  it('存在しない実施場所には保存せず Venue not found を投げる', async () => {
    const { imageStorage, service } = setup(null);

    await expect(service.setVenueImage(1, pngImage)).rejects.toThrow(
      'Venue not found'
    );
    expect(imageStorage.put).not.toHaveBeenCalled();
  });

  it('画像を削除すると、紐づけを外して保存先からも削除する', async () => {
    const { gatheringSpotRepository, imageStorage, service } = setup({
      imageKey: 'gathering-spots/2/old.png',
    });

    await service.deleteGatheringSpotImage(2);

    expect(gatheringSpotRepository.updateImageKey).toHaveBeenCalledWith(
      2,
      null
    );
    expect(imageStorage.delete).toHaveBeenCalledWith(
      'gathering-spots/2/old.png'
    );
  });

  it('画像が無い場所の削除は何もしない', async () => {
    const { venueRepository, imageStorage, service } = setup();

    await service.deleteVenueImage(1);

    expect(venueRepository.updateImageKey).not.toHaveBeenCalled();
    expect(imageStorage.delete).not.toHaveBeenCalled();
  });

  it('存在しない集合場所の画像削除は Gathering spot not found を投げる', async () => {
    const { service } = setup(null);

    await expect(service.deleteGatheringSpotImage(2)).rejects.toThrow(
      'Gathering spot not found'
    );
  });
});
