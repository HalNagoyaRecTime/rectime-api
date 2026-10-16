import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { IPlaceImageKeyRepository } from '../../domain/interfaces/repositories/IPlaceImageKeyRepository';
import * as schema from '../database/schema';
import { gathering_spots, venues } from '../database/schema';

export function createPlaceImageKeyRepository(
  db: D1Database
): IPlaceImageKeyRepository {
  const orm = drizzle(db, { schema });

  return {
    async isInUse(imageKey) {
      const [venue, gatheringSpot] = await Promise.all([
        orm
          .select({ id: venues.id })
          .from(venues)
          .where(eq(venues.imageKey, imageKey))
          .get(),
        orm
          .select({ id: gathering_spots.id })
          .from(gathering_spots)
          .where(eq(gathering_spots.imageKey, imageKey))
          .get(),
      ]);
      return Boolean(venue || gatheringSpot);
    },
  };
}
