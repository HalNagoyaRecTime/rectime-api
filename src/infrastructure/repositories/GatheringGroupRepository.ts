import type { D1Database } from '@cloudflare/workers-types';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { GatheringGroupEntity } from '../../domain/entities/GatheringGroup';
import { IGatheringGroupRepository } from '../../domain/interfaces/repositories/IGatheringGroupRepository';
import * as schema from '../database/schema';
import { gathering_groups } from '../database/schema';

function toEntity(
  row: typeof gathering_groups.$inferSelect
): GatheringGroupEntity {
  return {
    gathering_group_id: row.id,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createGatheringGroupRepository(
  db: D1Database
): IGatheringGroupRepository {
  const orm = drizzle(db, { schema });

  return {
    async findAll(): Promise<GatheringGroupEntity[]> {
      const rows = await orm
        .select()
        .from(gathering_groups)
        .orderBy(asc(gathering_groups.id))
        .all();
      return rows.map(toEntity);
    },

    async create(): Promise<GatheringGroupEntity> {
      const row = await orm
        .insert(gathering_groups)
        .values({})
        .returning()
        .get();
      return toEntity(row);
    },
  };
}
