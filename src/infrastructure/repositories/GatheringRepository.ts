import type { D1Database } from '@cloudflare/workers-types';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  CreateGatheringInput,
  GatheringDetailsEntity,
} from '../../domain/entities/Gathering';
import { IGatheringRepository } from '../../domain/interfaces/repositories/IGatheringRepository';
import * as schema from '../database/schema';
import {
  events,
  gathering_groups,
  gathering_spots,
  gatherings,
} from '../database/schema';

const detailSelection = {
  gathering_id: gatherings.id,
  gathering_group_id: gatherings.gatheringGroupId,
  event_id: gatherings.eventId,
  gathering_spot_id: gatherings.gatheringSpotId,
  gathering_time: gatherings.gatheringTime,
  round: gatherings.round,
  created_at: gatherings.createdAt,
  updated_at: gatherings.updatedAt,
  gathering_group_user_id: gathering_groups.userId,
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
      .innerJoin(
        gathering_groups,
        eq(gatherings.gatheringGroupId, gathering_groups.id)
      )
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
        .innerJoin(
          gathering_groups,
          eq(gatherings.gatheringGroupId, gathering_groups.id)
        )
        .innerJoin(events, eq(gatherings.eventId, events.id))
        .innerJoin(
          gathering_spots,
          eq(gatherings.gatheringSpotId, gathering_spots.id)
        )
        .orderBy(asc(gatherings.id))
        .all();
    },

    async existsGatheringGroup(gatheringGroupId: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: gathering_groups.id })
          .from(gathering_groups)
          .where(eq(gathering_groups.id, gatheringGroupId))
          .get()
      );
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
          gatheringGroupId: input.gathering_group_id,
          eventId: input.event_id,
          gatheringSpotId: input.gathering_spot_id,
          gatheringTime: input.gathering_time,
          round: input.round,
        })
        .onConflictDoNothing({ target: gatherings.gatheringGroupId })
        .returning({ id: gatherings.id })
        .get();
      if (!row) throw new Error('Gathering already exists for this group');

      const gathering = await findById(row.id);
      if (!gathering) throw new Error('Failed to create gathering');
      return gathering;
    },
  };
}
