import { z } from './schemas';

export const eventVenueResponseSchema = z
  .object({
    venue_id: z.number().int(),
    venue_name: z.string(),
    image_url: z.string().nullable().openapi({
      description:
        '画像のURL（APIのオリジンからの相対パス）。画像が無ければnull。差し替えるとURLが変わる。',
      example: '/api/v1/venues/1/image?v=3f9a.webp',
    }),
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
