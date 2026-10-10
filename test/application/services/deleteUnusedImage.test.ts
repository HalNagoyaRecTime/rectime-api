import { describe, expect, it, vi } from 'vitest';
import { deleteUnusedImage } from '../../../src/application/services/deleteUnusedImage';
import type { IImageStorage } from '../../../src/domain/interfaces/storages/IImageStorage';

function createStorage(): IImageStorage {
  return { get: vi.fn(), put: vi.fn(), delete: vi.fn() };
}

describe('deleteUnusedImage', () => {
  it('キーがあれば保存先から削除する', async () => {
    const storage = createStorage();

    await deleteUnusedImage(storage, 'venues/1/a.png');

    expect(storage.delete).toHaveBeenCalledWith('venues/1/a.png');
  });

  it('キーが無ければ何もしない', async () => {
    const storage = createStorage();

    await deleteUnusedImage(storage, null);

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('削除に失敗しても例外を投げず、消せなかったキーをログに残す', async () => {
    const storage = createStorage();
    vi.mocked(storage.delete).mockRejectedValue(new Error('R2 error'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      deleteUnusedImage(storage, 'venues/1/a.png')
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      '[PLACE_IMAGE] failed to delete unused image',
      { imageKey: 'venues/1/a.png', error: 'R2 error' }
    );
  });
});
