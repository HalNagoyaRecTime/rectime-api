import { z } from './schemas';

// Round単位の集合設定を表すresponse schema。保存(PUT /events/{eventId}/gatherings)と
// Event詳細の読み取りで同じ構造を返すため、どちらのroute定義からも参照できる場所に置く。

export const gatheringSpotSummarySchema = z
  .object({
    gathering_spot_id: z.number().int(),
    gathering_spot_name: z.string(),
  })
  .openapi('GatheringSpotSummary');

export const gatheringSettingResponseSchema = z
  .object({
    gathering_id: z.number().int(),
    gathering_time: z.string().openapi({
      description:
        'HH:mm形式。集合設定APIで保存した値は常に実在する時刻だが、旧APIで未設定のまま作成された行は `99:59` のまま返る。',
      example: '10:45',
    }),
    gathering_spot: gatheringSpotSummarySchema,
    member_count: z.number().int(),
  })
  .openapi('GatheringSetting');

export const roundSettingResponseSchema = z
  .object({
    round: z.number().int(),
    gatherings: z.array(gatheringSettingResponseSchema),
  })
  .openapi('RoundSetting');
