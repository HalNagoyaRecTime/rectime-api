import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { GatheringGroupMemberEntity } from '../../domain/entities/GatheringGroupMember';
import { GatheringMemberSummary } from '../../domain/entities/GatheringMemberSummary';
import { IGatheringGroupMemberRepository } from '../../domain/interfaces/repositories/IGatheringGroupMemberRepository';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import * as schema from '../database/schema';
import { gathering_group_members, gatherings, users } from '../database/schema';

function selectMemberSummaries(
  orm: ReturnType<typeof drizzle<typeof schema>>,
  gatheringId: number
) {
  return orm
    .select({ user_id: gathering_group_members.userId })
    .from(gathering_group_members)
    .where(eq(gathering_group_members.gatheringId, gatheringId))
    .orderBy(asc(gathering_group_members.id))
    .all();
}

function toEntity(
  row: typeof gathering_group_members.$inferSelect
): GatheringGroupMemberEntity {
  return {
    gathering_group_member_id: row.id,
    gathering_id: row.gatheringId,
    user_id: row.userId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createGatheringGroupMemberRepository(
  db: D1Database,
  userRepository: IUserRepository
): IGatheringGroupMemberRepository {
  const orm = drizzle(db, { schema });

  return {
    async existsGathering(gatheringId: number): Promise<boolean> {
      const row = await orm
        .select({ id: gatherings.id })
        .from(gatherings)
        .where(eq(gatherings.id, gatheringId))
        .get();
      return Boolean(row);
    },

    // ユーザーの存在確認自体はUserRepositoryの責務のため、重複させず委譲する。
    existsUser: userId => userRepository.exists(userId),

    async findByGatheringId(
      gatheringId: number
    ): Promise<GatheringGroupMemberEntity[]> {
      const rows = await orm
        .select()
        .from(gathering_group_members)
        .where(eq(gathering_group_members.gatheringId, gatheringId))
        .orderBy(asc(gathering_group_members.id))
        .all();
      return rows.map(toEntity);
    },

    async findMemberSummariesByGatheringId(
      gatheringId: number
    ): Promise<GatheringMemberSummary[]> {
      return selectMemberSummaries(orm, gatheringId);
    },

    async findMissingUserIds(userIds: number[]): Promise<number[]> {
      if (userIds.length === 0) return [];
      const existing = await orm
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, userIds))
        .all();
      const existingIds = new Set(existing.map(row => row.id));
      return userIds.filter(id => !existingIds.has(id));
    },

    async replaceMembers(
      gatheringId: number,
      userIds: number[]
    ): Promise<GatheringMemberSummary[]> {
      const deleteStatement = orm
        .delete(gathering_group_members)
        .where(eq(gathering_group_members.gatheringId, gatheringId));

      if (userIds.length > 0) {
        const insertStatement = orm
          .insert(gathering_group_members)
          .values(userIds.map(userId => ({ gatheringId, userId })));
        // D1のbatch()は複数文を1つのトランザクションとして原子的に実行するため、
        // 全削除→全挿入の間に途中状態が外部から見えることはない。
        await orm.batch([deleteStatement, insertStatement]);
      } else {
        await deleteStatement.run();
      }

      return selectMemberSummaries(orm, gatheringId);
    },

    async create(
      gatheringId: number,
      userId: number
    ): Promise<GatheringGroupMemberEntity> {
      const row = await orm
        .insert(gathering_group_members)
        .values({ gatheringId, userId })
        .onConflictDoNothing({
          target: [
            gathering_group_members.gatheringId,
            gathering_group_members.userId,
          ],
        })
        .returning()
        .get();
      if (!row) throw new Error('Gathering member already exists');
      return toEntity(row);
    },

    async remove(gatheringId: number, userId: number): Promise<boolean> {
      const row = await orm
        .delete(gathering_group_members)
        .where(
          and(
            eq(gathering_group_members.gatheringId, gatheringId),
            eq(gathering_group_members.userId, userId)
          )
        )
        .returning()
        .get();
      return Boolean(row);
    },

    async deleteByUserId(userId: number): Promise<void> {
      await orm
        .delete(gathering_group_members)
        .where(eq(gathering_group_members.userId, userId))
        .run();
    },
  };
}
