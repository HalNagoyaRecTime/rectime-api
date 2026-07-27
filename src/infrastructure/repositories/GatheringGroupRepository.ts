import type { D1Database } from '@cloudflare/workers-types';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { GatheringGroupEntity } from '../../domain/entities/GatheringGroup';
import { IGatheringGroupRepository } from '../../domain/interfaces/repositories/IGatheringGroupRepository';
import * as schema from '../database/schema';
import {
  gathering_group_members,
  gathering_groups,
  gatherings,
} from '../database/schema';

function toEntity(
  row: typeof gathering_groups.$inferSelect
): GatheringGroupEntity {
  return {
    gathering_group_id: row.id,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function isForeignKeyConstraintError(error: unknown): boolean {
  const visited = new Set<Error>();
  let current = error;

  while (current instanceof Error && !visited.has(current)) {
    if (current.message.includes('FOREIGN KEY constraint failed')) {
      return true;
    }
    visited.add(current);
    current = current.cause;
  }

  return false;
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

    async exists(gatheringGroupId: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: gathering_groups.id })
          .from(gathering_groups)
          .where(eq(gathering_groups.id, gatheringGroupId))
          .get()
      );
    },

    async hasGathering(gatheringGroupId: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: gatherings.id })
          .from(gatherings)
          .where(eq(gatherings.gatheringGroupId, gatheringGroupId))
          .get()
      );
    },

    async remove(gatheringGroupId: number): Promise<boolean> {
      const statements = [
        orm
          .delete(gathering_group_members)
          .where(
            eq(gathering_group_members.gatheringGroupId, gatheringGroupId)
          ),
        orm
          .delete(gathering_groups)
          .where(eq(gathering_groups.id, gatheringGroupId)),
      ] as const;
      try {
        const results = await orm.batch(statements);
        return results[1].meta.changes === 1;
      } catch (error) {
        if (isForeignKeyConstraintError(error)) {
          throw new Error('Gathering group is assigned to an event');
        }
        throw error;
      }
    },
  };
}
