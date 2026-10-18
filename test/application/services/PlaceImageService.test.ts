import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PLACE_IMAGE_BYTES,
  PLACE_IMAGE_CONFLICT,
  createPlaceImageService,
} from '../../../src/application/services/PlaceImageService';
import type { IGatheringSpotRepository } from '../../../src/domain/interfaces/repositories/IGatheringSpotRepository';
import type { IVenueRepository } from '../../../src/domain/interfaces/repositories/IVenueRepository';
import type { IImageStorage } from '../../../src/domain/interfaces/storages/IImageStorage';

function setup(found: { imageKey: string | null } | null = { imageKey: null }) {
  const venueRepository = {
    findImageKey: vi.fn().mockResolvedValue(found),
    replaceImageKey: vi.fn().mockResolvedValue(true),
  } as unknown as IVenueRepository;
  const gatheringSpotRepository = {
    findImageKey: vi.fn().mockResolvedValue(found),
    replaceImageKey: vi.fn().mockResolvedValue(true),
  } as unknown as IGatheringSpotRepository;
  const imageStorage: IImageStorage = { put: vi.fn(), delete: vi.fn() };
  const deleteUnusedImage = vi.fn();
  return {
    venueRepository,
    gatheringSpotRepository,
    imageStorage,
    deleteUnusedImage,
    service: createPlaceImageService(
      imageStorage,
      deleteUnusedImage,
      venueRepository,
      gatheringSpotRepository
    ),
  };
}

const bytes = (...values: number[]) => new Uint8Array(values).buffer;
const pngBody = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
const jpegBody = bytes(0xff, 0xd8, 0xff, 0xe0);
const webpBody = bytes(
  ...[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
);
const pngImage = { body: pngBody, contentType: 'image/png' };

describe('PlaceImageService', () => {
  it('実施場所の画像を保存し、読み取ったキーから新しいキーへ差し替える', async () => {
    const { venueRepository, imageStorage, service } = setup();

    await service.setVenueImage(1, pngImage);

    const key = vi.mocked(imageStorage.put).mock.calls[0][0];
    expect(key).toMatch(/^venues\/1\/[0-9a-f-]+\.png$/);
    expect(imageStorage.put).toHaveBeenCalledWith(key, pngBody, 'image/png');
    expect(venueRepository.replaceImageKey).toHaveBeenCalledWith(1, null, key);
  });

  it('集合場所の画像は gathering-spots 配下に保存する', async () => {
    const { gatheringSpotRepository, imageStorage, service } = setup();

    await service.setGatheringSpotImage(2, {
      body: jpegBody,
      contentType: 'image/jpeg',
    });

    const key = vi.mocked(imageStorage.put).mock.calls[0][0];
    expect(key).toMatch(/^gathering-spots\/2\/[0-9a-f-]+\.jpg$/);
    expect(gatheringSpotRepository.replaceImageKey).toHaveBeenCalledWith(
      2,
      null,
      key
    );
  });

  it('WebP の画像を保存できる', async () => {
    const { imageStorage, service } = setup();

    await service.setVenueImage(1, {
      body: webpBody,
      contentType: 'image/webp',
    });

    expect(vi.mocked(imageStorage.put).mock.calls[0][0]).toMatch(/\.webp$/);
  });

  it('差し替えると、前の画像を不要になった画像として削除する', async () => {
    const { venueRepository, deleteUnusedImage, service } = setup({
      imageKey: 'venues/1/old.png',
    });

    await service.setVenueImage(1, pngImage);

    expect(venueRepository.replaceImageKey).toHaveBeenCalledWith(
      1,
      'venues/1/old.png',
      expect.any(String)
    );
    expect(deleteUnusedImage).toHaveBeenCalledWith('venues/1/old.png');
  });

  it('読み取った後にキーが変わっていたら、保存した画像を消して競合を投げる', async () => {
    const { venueRepository, imageStorage, deleteUnusedImage, service } = setup(
      { imageKey: 'venues/1/old.png' }
    );
    vi.mocked(venueRepository.replaceImageKey).mockResolvedValue(false);

    await expect(service.setVenueImage(1, pngImage)).rejects.toThrow(
      PLACE_IMAGE_CONFLICT
    );
    const key = vi.mocked(imageStorage.put).mock.calls[0][0];
    expect(imageStorage.delete).toHaveBeenCalledWith(key);
    expect(deleteUnusedImage).not.toHaveBeenCalled();
  });

  it('キーの差し替えに失敗したら、保存した画像を消してエラーを投げ直す', async () => {
    const { venueRepository, imageStorage, deleteUnusedImage, service } = setup(
      { imageKey: 'venues/1/old.png' }
    );
    vi.mocked(venueRepository.replaceImageKey).mockRejectedValue(
      new Error('D1 error')
    );

    await expect(service.setVenueImage(1, pngImage)).rejects.toThrow(
      'D1 error'
    );
    const key = vi.mocked(imageStorage.put).mock.calls[0][0];
    expect(imageStorage.delete).toHaveBeenCalledWith(key);
    expect(deleteUnusedImage).not.toHaveBeenCalled();
  });

  it('Object の組み込みプロパティ名の形式は保存せず Invalid image を投げる', async () => {
    const { imageStorage, service } = setup();

    await expect(
      service.setVenueImage(1, { body: pngBody, contentType: 'toString' })
    ).rejects.toThrow('Invalid image');
    expect(imageStorage.put).not.toHaveBeenCalled();
  });

  it.each([
    ['対応していない形式', { body: pngBody, contentType: 'image/gif' }],
    ['空のファイル', { body: new ArrayBuffer(0), contentType: 'image/png' }],
    [
      '画像ではないデータ',
      { body: bytes(0x3c, 0x68, 0x74, 0x6d, 0x6c), contentType: 'image/png' },
    ],
    [
      '宣言と中身の形式が違うデータ',
      { body: jpegBody, contentType: 'image/png' },
    ],
    [
      'RIFF だが WebP ではないデータ',
      {
        body: bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45),
        contentType: 'image/webp',
      },
    ],
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

  it('画像を削除すると、紐づけを外して不要になった画像として削除する', async () => {
    const { gatheringSpotRepository, deleteUnusedImage, service } = setup({
      imageKey: 'gathering-spots/2/old.png',
    });

    await service.deleteGatheringSpotImage(2);

    expect(gatheringSpotRepository.replaceImageKey).toHaveBeenCalledWith(
      2,
      'gathering-spots/2/old.png',
      null
    );
    expect(deleteUnusedImage).toHaveBeenCalledWith('gathering-spots/2/old.png');
  });

  it('削除の前にキーが変わっていたら、画像を消さず競合を投げる', async () => {
    const { venueRepository, deleteUnusedImage, service } = setup({
      imageKey: 'venues/1/old.png',
    });
    vi.mocked(venueRepository.replaceImageKey).mockResolvedValue(false);

    await expect(service.deleteVenueImage(1)).rejects.toThrow(
      PLACE_IMAGE_CONFLICT
    );
    expect(deleteUnusedImage).not.toHaveBeenCalled();
  });

  it('画像が無い場所の削除は何もしない', async () => {
    const { venueRepository, deleteUnusedImage, service } = setup();

    await service.deleteVenueImage(1);

    expect(venueRepository.replaceImageKey).not.toHaveBeenCalled();
    expect(deleteUnusedImage).not.toHaveBeenCalled();
  });

  it('存在しない集合場所の画像削除は Gathering spot not found を投げる', async () => {
    const { service } = setup(null);

    await expect(service.deleteGatheringSpotImage(2)).rejects.toThrow(
      'Gathering spot not found'
    );
  });
});
