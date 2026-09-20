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
