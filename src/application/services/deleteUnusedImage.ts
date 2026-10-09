import { IImageStorage } from '../../domain/interfaces/storages/IImageStorage';

export async function deleteUnusedImage(
  imageStorage: IImageStorage,
  imageKey: string | null
): Promise<void> {
  if (!imageKey) return;
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
}
