import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';
import { IGatheringGroupMemberRepository } from '../../domain/interfaces/repositories/IGatheringGroupMemberRepository';
import * as schema from '../database/schema';
import {
  gathering_group_members,
  gathering_groups,
  users,
} from '../database/schema';

function toEntity(
  row: typeof gathering_group_members.$inferSelect
): GatheringGroupMemberEntity {
  return {
    gathering_group_member_id: row.id,
    gathering_group_id: row.gatheringGroupId,
    user_id: row.userId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createGatheringGroupMemberRepository(
  db: D1Database
): IGatheringGroupMemberRepository {
  const orm = drizzle(db, { schema });

  return {
    async existsGatheringGroup(gatheringGroupId: number): Promise<boolean> {
      const row = await orm
        .select({ id: gathering_groups.id })
        .from(gathering_groups)
        .where(eq(gathering_groups.id, gatheringGroupId))
        .get();
      return Boolean(row);
    },

    async existsUser(userId: number): Promise<boolean> {
      const row = await orm
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .get();
      return Boolean(row);
    },

    async findByGatheringGroupId(
      gatheringGroupId: number
    ): Promise<GatheringGroupMemberEntity[]> {
      const rows = await orm
        .select()
        .from(gathering_group_members)
        .where(eq(gathering_group_members.gatheringGroupId, gatheringGroupId))
        .orderBy(asc(gathering_group_members.id))
        .all();
      return rows.map(toEntity);
    },

    async create(
      gatheringGroupId: number,
      userId: number
    ): Promise<GatheringGroupMemberEntity> {
      const row = await orm
        .insert(gathering_group_members)
        .values({ gatheringGroupId, userId })
        .onConflictDoNothing({
          target: [
            gathering_group_members.gatheringGroupId,
            gathering_group_members.userId,
          ],
        })
        .returning()
        .get();
      if (!row) throw new Error('Gathering group member already exists');
      return toEntity(row);
    },

    async remove(gatheringGroupId: number, userId: number): Promise<boolean> {
      const row = await orm
        .delete(gathering_group_members)
        .where(
          and(
            eq(gathering_group_members.gatheringGroupId, gatheringGroupId),
            eq(gathering_group_members.userId, userId)
          )
        )
        .returning()
        .get();
      return Boolean(row);
    },
  };
}
