import { IImageUrlSigner } from '../../domain/interfaces/storages/IImageUrlSigner';

export type ImageUrlOf = (imageKey: string | null) => string | null;

export async function signImageUrls(
  imageUrlSigner: IImageUrlSigner,
  imageKeys: (string | null)[]
): Promise<ImageUrlOf> {
  const keys = [
    ...new Set(imageKeys.filter((key): key is string => key !== null)),
  ];
  const urls = new Map(
    await Promise.all(
      keys.map(async key => [key, await imageUrlSigner.sign(key)] as const)
    )
  );
  return imageKey => (imageKey === null ? null : (urls.get(imageKey) ?? null));
}
