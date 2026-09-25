import type { D1Database } from '@cloudflare/workers-types';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { VenueEntity } from '../../domain/entities/Venue';
import { IVenueRepository } from '../../domain/interfaces/repositories/IVenueRepository';
import * as schema from '../database/schema';
import { event_venues, venues } from '../database/schema';
import { escapeLikePattern } from '../helpers/escapeLikePattern';

function toEntity(row: typeof venues.$inferSelect): VenueEntity {
  return {
    venue_id: row.id,
    venue_name: row.name,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function createVenueRepository(db: D1Database): IVenueRepository {
  const orm = drizzle(db, { schema });

  return {
    async findAll(): Promise<VenueEntity[]> {
      const rows = await orm
        .select()
        .from(venues)
        .orderBy(asc(venues.id))
        .all();
      return rows.map(toEntity);
    },

    async findPage(options) {
      const nameFilter = options.name
        ? sql`${venues.name} LIKE ${`%${escapeLikePattern(options.name)}%`} ESCAPE ${'\\'}`
        : undefined;
      const sortColumn = {
        id: venues.id,
        name: venues.name,
        createdAt: venues.createdAt,
        updatedAt: venues.updatedAt,
      }[options.sortBy ?? 'id'];
      const orderBy =
        options.sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn);
      const [rows, totalRow] = await Promise.all([
        orm
          .select()
          .from(venues)
          .where(nameFilter)
          .orderBy(orderBy)
          .limit(options.limit)
          .offset(options.offset)
          .all(),
        orm.select({ total: count() }).from(venues).where(nameFilter).get(),
      ]);
      return {
        venues: rows.map(toEntity),
        total: totalRow?.total ?? 0,
        limit: options.limit,
        offset: options.offset,
      };
    },

    async create(venueName: string): Promise<VenueEntity> {
      const row = await orm
        .insert(venues)
        .values({ name: venueName })
        .returning()
        .get();
      if (!row) throw new Error('Failed to create venue');
      return toEntity(row);
    },

    async update(venueId, input): Promise<VenueEntity | null> {
      const row = await orm
        .update(venues)
        .set({ name: input.venue_name, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(venues.id, venueId))
        .returning()
        .get();
      return row ? toEntity(row) : null;
    },

    async delete(venueId: number): Promise<boolean> {
      const result = await orm
        .delete(venues)
        .where(eq(venues.id, venueId))
        .run();
      return result.meta.changes > 0;
    },

    async hasEvents(venueId: number): Promise<boolean> {
      return Boolean(
        await orm
          .select({ id: event_venues.id })
          .from(event_venues)
          .where(eq(event_venues.venueId, venueId))
          .get()
      );
    },
  };
}
