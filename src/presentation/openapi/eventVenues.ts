import { z } from './schemas';

export const eventVenueResponseSchema = z
  .object({
    venue_id: z.number().int(),
    venue_name: z.string(),
  })
  .openapi('EventVenue');

export const eventVenueListResponseSchema = z
  .array(eventVenueResponseSchema)
  .openapi({ description: 'イベントの実施場所。venue_idの昇順。' });

export const venueIdsSchema = z
  .array(z.number().int().positive())
  .min(1)
  .max(20, { message: 'venue_ids must contain at most 20 items' })
  .refine(ids => new Set(ids).size === ids.length, {
    message: 'venue_ids must not contain duplicates',
  })
  .openapi({ description: '実施場所IDの一覧。1〜20件、重複なし。全置換。' });
