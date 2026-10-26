import { asc, eq, type SQL } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';
import type { EventVenueEntity } from '../../domain/entities/Event';
import { event_venues, venues } from '../database/schema';

interface EventVenueRow {
  eventId: number;
  venueId: number;
  venueName: string;
  imageKey: string | null;
}

// 競技に紐づく実施場所の取得クエリ。ここでは実行せず、呼び出し側が競技本体の取得と
// 同じbatchで実行する。別々に実行すると、間に更新が挟まったときに「更新後の
// lock_versionと更新前の実施場所」を返してしまい、そのレスポンスをPUTすると、
// 直前の実施場所の変更を古い値で上書きできてしまう。
export function selectEventVenues(
  orm: ReturnType<typeof drizzle>,
  where: SQL | undefined
) {
  return orm
    .select({
      eventId: event_venues.eventId,
      venueId: venues.id,
      venueName: venues.name,
      imageKey: venues.imageKey,
    })
    .from(event_venues)
    .innerJoin(venues, eq(event_venues.venueId, venues.id))
    .where(where)
    .orderBy(asc(event_venues.eventId), asc(venues.id));
}

export function groupVenuesByEventId(
  rows: EventVenueRow[]
): Map<number, EventVenueEntity[]> {
  const venuesByEventId = new Map<number, EventVenueEntity[]>();
  for (const row of rows) {
    const list = venuesByEventId.get(row.eventId) ?? [];
    list.push({
      venue_id: row.venueId,
      venue_name: row.venueName,
      image_key: row.imageKey,
    });
    venuesByEventId.set(row.eventId, list);
  }
  return venuesByEventId;
}
