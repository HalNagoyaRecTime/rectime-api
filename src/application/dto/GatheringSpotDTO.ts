/** HTTPレスポンスとして返す集合場所。 */
export interface GatheringSpotDTO {
  gathering_spot_id: number;
  gathering_spot_name: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface GatheringSpotPageDTO {
  gathering_spots: GatheringSpotDTO[];
  total: number;
  limit: number;
  offset: number;
}
