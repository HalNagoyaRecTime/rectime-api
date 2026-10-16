import { describe, expect, it, vi } from 'vitest';
import { signImageUrls } from '../../../src/application/services/imageUrls';
import type { IImageUrlSigner } from '../../../src/domain/interfaces/storages/IImageUrlSigner';

function createSigner(): IImageUrlSigner {
  return { sign: vi.fn(async key => `https://signed.example/${key}`) };
}

describe('signImageUrls', () => {
  it('画像のキーを署名付きURLに変換する', async () => {
    const imageUrlOf = await signImageUrls(createSigner(), ['venues/1/a.png']);

    expect(imageUrlOf('venues/1/a.png')).toBe(
      'https://signed.example/venues/1/a.png'
    );
  });

  it('画像が無い場所は null を返す', async () => {
    const imageUrlOf = await signImageUrls(createSigner(), [null]);

    expect(imageUrlOf(null)).toBeNull();
  });

  it('同じキーは1回だけ署名する', async () => {
    const signer = createSigner();

    await signImageUrls(signer, ['venues/1/a.png', 'venues/1/a.png', null]);

    expect(signer.sign).toHaveBeenCalledTimes(1);
  });
});
