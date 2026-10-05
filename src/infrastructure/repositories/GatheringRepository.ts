import type { D1Database } from '@cloudflare/workers-types';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { GatheringDetailsEntity } from '../../domain/entities/Gathering';
import { IGatheringRepository } from '../../domain/interfaces/repositories/IGatheringRepository';
import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
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
  db: D1Database,
  eventRepository: IEventRepository
): IGatheringRepository {
  const orm = drizzle(db, { schema });

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

    // 存在確認自体は対応する各Repositoryの責務のため、重複させずそれぞれへ委譲する。
    existsEvent: eventId => eventRepository.exists(eventId),
  };
}
