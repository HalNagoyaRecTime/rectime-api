import type { D1Database } from '@cloudflare/workers-types';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  sql,
} from 'drizzle-orm';
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
    image_key: row.imageKey,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    lock_version: row.lockVersion,
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

    async findExistingIds(gatheringSpotIds: number[]): Promise<Set<number>> {
      const uniqueIds = Array.from(new Set(gatheringSpotIds));
      if (uniqueIds.length === 0) return new Set();
      const rows = await orm
        .select({ id: gathering_spots.id })
        .from(gathering_spots)
        .where(inArray(gathering_spots.id, uniqueIds))
        .all();
      return new Set(rows.map(row => row.id));
    },

    async findAll(): Promise<GatheringSpotEntity[]> {
      const rows = await orm
        .select()
        .from(gathering_spots)
        .orderBy(asc(gathering_spots.id))
        .all();
      return rows.map(toEntity);
    },

    async findPage(options): Promise<{
      gathering_spots: GatheringSpotEntity[];
      total: number;
      limit: number;
      offset: number;
    }> {
      const nameFilter = options.name
        ? like(gathering_spots.name, `%${options.name}%`)
        : undefined;
      const sortColumn = {
        id: gathering_spots.id,
        name: gathering_spots.name,
        createdAt: gathering_spots.createdAt,
        updatedAt: gathering_spots.updatedAt,
      }[options.sortBy ?? 'id'];
      const orderBy =
        options.sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn);
      const [rows, totalRow] = await Promise.all([
        orm
          .select()
          .from(gathering_spots)
          .where(nameFilter)
          .orderBy(orderBy)
          .limit(options.limit)
          .offset(options.offset)
          .all(),
        orm
          .select({ total: count() })
          .from(gathering_spots)
          .where(nameFilter)
          .get(),
      ]);
      return {
        gathering_spots: rows.map(toEntity),
        total: totalRow?.total ?? 0,
        limit: options.limit,
        offset: options.offset,
      };
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
      // 版番号(expected_lock_version)が指定された場合は、取得時点から変更されて
      // いないこともWHEREで確認する。GETとPUTの間に別操作が挟まっていれば0件更新に
      // なり、呼び出し側がnullとして受け取る。版番号は更新のたびに必ず1ずつ増える
      // ため、updated_at（秒単位）では区別できない同じ秒内の更新も検出できる。
      const row = await orm
        .update(gathering_spots)
        .set({
          name: input.gathering_spot_name,
          updatedAt: sql`CURRENT_TIMESTAMP`,
          lockVersion: sql`${gathering_spots.lockVersion} + 1`,
        })
        .where(
          and(
            eq(gathering_spots.id, gatheringSpotId),
            input.expected_lock_version === undefined
              ? undefined
              : eq(gathering_spots.lockVersion, input.expected_lock_version)
          )
        )
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

    async findImageKey(gatheringSpotId) {
      const row = await orm
        .select({ imageKey: gathering_spots.imageKey })
        .from(gathering_spots)
        .where(eq(gathering_spots.id, gatheringSpotId))
        .get();
      return row ?? null;
    },

    async replaceImageKey(gatheringSpotId, currentImageKey, imageKey) {
      const result = await orm
        .update(gathering_spots)
        .set({
          imageKey,
          updatedAt: sql`CURRENT_TIMESTAMP`,
          lockVersion: sql`${gathering_spots.lockVersion} + 1`,
        })
        .where(
          and(
            eq(gathering_spots.id, gatheringSpotId),
            currentImageKey === null
              ? isNull(gathering_spots.imageKey)
              : eq(gathering_spots.imageKey, currentImageKey)
          )
        )
        .run();
      return result.meta.changes > 0;
    },
  };
}
