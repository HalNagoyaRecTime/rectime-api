import type { D1Database } from '@cloudflare/workers-types';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  CreateGatheringInput,
  GatheringDetailsEntity,
} from '../../domain/entities/Gathering';
import { IGatheringRepository } from '../../domain/interfaces/repositories/IGatheringRepository';
import * as schema from '../database/schema';
import { events, gathering_spots, gatherings } from '../database/schema';

const detailSelection = {
  gathering_id: gatherings.id,
  event_id: gatherings.eventId,
  gathering_spot_id: gatherings.gatheringSpotId,
  gathering_time: gatherings.gatheringTime,
  round: gatherings.round,
  created_at: gatherings.createdAt,
  updated_at: gatherings.updatedAt,
  event_name: events.name,
  gathering_spot_name: gathering_spots.name,
};

export function createGatheringRepository(
  db: D1Database
): IGatheringRepository {
  const orm = drizzle(db, { schema });

  const findById = async (
    gatheringId: number
  ): Promise<GatheringDetailsEntity | null> => {
    const row = await orm
      .select(detailSelection)
      .from(gatherings)
      .innerJoin(events, eq(gatherings.eventId, events.id))
      .innerJoin(
        gathering_spots,
        eq(gatherings.gatheringSpotId, gathering_spots.id)
      )
      .where(eq(gatherings.id, gatheringId))
      .get();
    return row ?? null;
  };

  return {
    async findAll(): Promise<GatheringDetailsEntity[]> {
      return orm
        .select(detailSelection)
        .from(gatherings)
        .innerJoin(events, eq(gatherings.eventId, events.id))
        .innerJoin(
          gathering_spots,
          eq(gatherings.gatheringSpotId, gathering_spots.id)
        )
        .orderBy(asc(gatherings.id))
        .all();
    },

    async findByEventId(eventId: number): Promise<GatheringDetailsEntity[]> {
      return orm
        .select(detailSelection)
        .from(gatherings)
        .innerJoin(events, eq(gatherings.eventId, events.id))
        .innerJoin(
          gathering_spots,
          eq(gatherings.gatheringSpotId, gathering_spots.id)
        )
        .where(eq(gatherings.eventId, eventId))
        .orderBy(asc(gatherings.id))
        .all();
    },

    async existsEvent(eventId: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: events.id })
          .from(events)
          .where(eq(events.id, eventId))
          .get()
      );
    },

    async existsGatheringSpot(gatheringSpotId: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: gathering_spots.id })
          .from(gathering_spots)
          .where(eq(gathering_spots.id, gatheringSpotId))
          .get()
      );
    },

    async create(input: CreateGatheringInput): Promise<GatheringDetailsEntity> {
      const row = await orm
        .insert(gatherings)
        .values({
          eventId: input.event_id,
          gatheringSpotId: input.gathering_spot_id,
          gatheringTime: input.gathering_time,
          round: input.round,
        })
        .returning({ id: gatherings.id })
        .get();
      if (!row) throw new Error('Failed to create gathering');

      const gathering = await findById(row.id);
      if (!gathering) throw new Error('Failed to create gathering');
      return gathering;
    },

    async remove(gatheringId: number): Promise<boolean> {
      // D1 batchはトランザクションとして実行される。集合メンバーだけ、または
      // 集合だけが削除された状態を残さないよう、子から順にまとめて削除する。
      const [, gatheringResult] = await db.batch([
        db
          .prepare('DELETE FROM gathering_group_members WHERE gathering_id = ?')
          .bind(gatheringId),
        db
          .prepare('DELETE FROM gatherings WHERE gathering_id = ?')
          .bind(gatheringId),
      ]);
      return (gatheringResult.meta.changes ?? 0) > 0;
    },
  };
}
