import type { D1Database } from '@cloudflare/workers-types';
import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { GatheringSpotEntity } from '../../domain/entities/GatheringSpot';
import { IGatheringSpotRepository } from '../../domain/interfaces/repositories/IGatheringSpotRepository';
import * as schema from '../database/schema';
import { gathering_spots } from '../database/schema';

function toEntity(
  row: typeof gathering_spots.$inferSelect
): GatheringSpotEntity {
  return {
    gathering_spot_id: row.id,
    gathering_spot_name: row.name,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createGatheringSpotRepository(
  db: D1Database
): IGatheringSpotRepository {
  const orm = drizzle(db, { schema });

  return {
    async exists(gatheringSpotId: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: gathering_spots.id })
          .from(gathering_spots)
          .where(eq(gathering_spots.id, gatheringSpotId))
          .get()
      );
    },

    async findAll(): Promise<GatheringSpotEntity[]> {
      const rows = await orm
        .select()
        .from(gathering_spots)
        .orderBy(asc(gathering_spots.id))
        .all();
      return rows.map(toEntity);
    },

    async findById(
      gatheringSpotId: number
    ): Promise<GatheringSpotEntity | null> {
      const row = await orm
        .select()
        .from(gathering_spots)
        .where(eq(gathering_spots.id, gatheringSpotId))
        .get();
      return row ? toEntity(row) : null;
    },

    async create(gatheringSpotName: string): Promise<GatheringSpotEntity> {
      const row = await orm
        .insert(gathering_spots)
        .values({ name: gatheringSpotName })
        .returning()
        .get();
      if (!row) throw new Error('Failed to create gathering spot');
      return toEntity(row);
    },

    async update(gatheringSpotId, input): Promise<GatheringSpotEntity | null> {
      const row = await orm
        .update(gathering_spots)
        .set({
          name: input.gathering_spot_name,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(gathering_spots.id, gatheringSpotId))
        .returning()
        .get();
      return row ? toEntity(row) : null;
    },

    async delete(gatheringSpotId: number): Promise<boolean> {
      const result = await orm
        .delete(gathering_spots)
        .where(eq(gathering_spots.id, gatheringSpotId))
        .run();
      return result.meta.changes > 0;
    },

    async hasGatherings(gatheringSpotId: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: schema.gatherings.id })
          .from(schema.gatherings)
          .where(eq(schema.gatherings.gatheringSpotId, gatheringSpotId))
          .get()
      );
    },
  };
}
