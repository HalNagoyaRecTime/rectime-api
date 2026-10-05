import { asc, eq, inArray } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';
import type { EventVenueEntity } from '../../domain/entities/Event';
import { event_venues, venues } from '../database/schema';
import { chunkArray } from './chunk';

const D1_MAX_BOUND_PARAMETERS = 100;

export async function findVenuesByEventIds(
  orm: ReturnType<typeof drizzle>,
  eventIds: number[]
): Promise<Map<number, EventVenueEntity[]>> {
  const venuesByEventId = new Map<number, EventVenueEntity[]>();
  if (eventIds.length === 0) {
    return venuesByEventId;
  }

  const uniqueIds = Array.from(new Set(eventIds));
  const chunkRows = await Promise.all(
    chunkArray(uniqueIds, D1_MAX_BOUND_PARAMETERS).map(chunk =>
      orm
        .select({
          eventId: event_venues.eventId,
          venueId: venues.id,
          venueName: venues.name,
        })
        .from(event_venues)
        .innerJoin(venues, eq(event_venues.venueId, venues.id))
        .where(inArray(event_venues.eventId, chunk))
        .orderBy(asc(event_venues.eventId), asc(venues.id))
        .all()
    )
  );

  for (const row of chunkRows.flat()) {
    const list = venuesByEventId.get(row.eventId) ?? [];
    list.push({ venue_id: row.venueId, venue_name: row.venueName });
    venuesByEventId.set(row.eventId, list);
  }
  return venuesByEventId;
}
