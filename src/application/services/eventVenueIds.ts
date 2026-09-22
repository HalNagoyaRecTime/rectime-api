import type { IVenueRepository } from '../../domain/interfaces/repositories/IVenueRepository';
import { isForeignKeyError } from './foreignKeyError';

export async function ensureVenuesExist(
  venueRepository: IVenueRepository,
  venueIds: number[]
): Promise<void> {
  const existing = await venueRepository.findExistingIds(venueIds);
  if (venueIds.some(id => !existing.has(id))) {
    throw new Error('Venue not found');
  }
}

// 事前確認と保存の間に実施場所が削除されると外部キー制約で失敗する。
export async function saveWithVenues<T>(save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (error) {
    if (isForeignKeyError(error)) throw new Error('Venue not found');
    throw error;
  }
}
