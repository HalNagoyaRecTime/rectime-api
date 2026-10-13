import { IPlaceImageKeyRepository } from '../../domain/interfaces/repositories/IPlaceImageKeyRepository';
import { IImageStorage } from '../../domain/interfaces/storages/IImageStorage';

export type DeleteUnusedImage = (imageKey: string | null) => Promise<void>;

export function createDeleteUnusedImage(
  imageStorage: IImageStorage,
  placeImageKeyRepository: IPlaceImageKeyRepository
): DeleteUnusedImage {
  return async imageKey => {
    if (!imageKey || (await placeImageKeyRepository.isInUse(imageKey))) {
      return;
    }
    try {
      await imageStorage.delete(imageKey);
    } catch (error) {
      // DBの更新は確定済みで、失敗として返しても再実行では消せないため、
      // 操作自体は成功として扱い、消せなかった画像はログに残す。
      console.error('[PLACE_IMAGE] failed to delete unused image', {
        imageKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
