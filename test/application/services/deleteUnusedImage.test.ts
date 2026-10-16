import { describe, expect, it, vi } from 'vitest';
import { createDeleteUnusedImage } from '../../../src/application/services/deleteUnusedImage';
import type { IImageStorage } from '../../../src/domain/interfaces/storages/IImageStorage';

function setup(isInUse = false) {
  const storage: IImageStorage = { put: vi.fn(), delete: vi.fn() };
  const deleteUnusedImage = createDeleteUnusedImage(storage, {
    isInUse: vi.fn().mockResolvedValue(isInUse),
  });
  return { storage, deleteUnusedImage };
}

describe('deleteUnusedImage', () => {
  it('どこからも使われていない画像は保存先から削除する', async () => {
    const { storage, deleteUnusedImage } = setup();

    await deleteUnusedImage('venues/1/a.png');

    expect(storage.delete).toHaveBeenCalledWith('venues/1/a.png');
  });

  it('ほかの場所がまだ使っている画像は削除しない', async () => {
    const { storage, deleteUnusedImage } = setup(true);

    await deleteUnusedImage('seed/place.png');

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('キーが無ければ何もしない', async () => {
    const { storage, deleteUnusedImage } = setup();

    await deleteUnusedImage(null);

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('削除に失敗しても例外を投げず、消せなかったキーをログに残す', async () => {
    const { storage, deleteUnusedImage } = setup();
    vi.mocked(storage.delete).mockRejectedValue(new Error('R2 error'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(deleteUnusedImage('venues/1/a.png')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      '[PLACE_IMAGE] failed to delete unused image',
      { imageKey: 'venues/1/a.png', error: 'R2 error' }
    );
  });
});
