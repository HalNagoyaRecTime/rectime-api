/** HTTPレスポンスとして返す実施場所。 */
export interface VenueDTO {
  venue_id: number;
  venue_name: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface VenuePageDTO {
  venues: VenueDTO[];
  total: number;
  limit: number;
  offset: number;
}
