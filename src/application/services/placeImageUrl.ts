function placeImageUrl(path: string, imageKey: string | null): string | null {
  if (!imageKey) return null;
  const version = imageKey.slice(imageKey.lastIndexOf('/') + 1);
  return `/api/v1/${path}/image?v=${encodeURIComponent(version)}`;
}

export function venueImageUrl(
  venueId: number,
  imageKey: string | null
): string | null {
  return placeImageUrl(`venues/${venueId}`, imageKey);
}

export function gatheringSpotImageUrl(
  gatheringSpotId: number,
  imageKey: string | null
): string | null {
  return placeImageUrl(`gathering-spots/${gatheringSpotId}`, imageKey);
}
