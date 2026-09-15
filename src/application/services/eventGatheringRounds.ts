import type { EventGatheringEntity } from '../../domain/entities/EventGathering';
import type {
  EventGatheringSettingsDTO,
  GatheringSettingDTO,
  RoundSettingDTO,
} from '../dto/EventGatheringSettingsDTO';

function toGatheringSettingDTO(
  gathering: EventGatheringEntity
): GatheringSettingDTO {
  return {
    gathering_id: gathering.gathering_id,
    gathering_time: gathering.gathering_time,
    gathering_spot: {
      gathering_spot_id: gathering.gathering_spot_id,
      gathering_spot_name: gathering.gathering_spot_name,
    },
    member_count: gathering.member_count,
  };
}

/**
 * Repositoryが返した集合予定の一覧を、Round単位のレスポンス構造へ束ねる。
 *
 * 並び順はRepositoryのSQLで確定している前提で、ここでは順序を変えない。
 * Round専用のテーブルは無く `gatherings.round` だけでRoundを表しているため、
 * 集合予定を1件も持たないRoundは結果に現れない。
 *
 * 集合設定の保存とEvent詳細の読み取りが同じ構造を返せるよう、どちらの
 * Application Serviceからも呼べる形にしている。
 */
export function buildRoundSettings(
  gatherings: EventGatheringEntity[]
): RoundSettingDTO[] {
  const rounds: RoundSettingDTO[] = [];
  for (const gathering of gatherings) {
    const last = rounds[rounds.length - 1];
    if (last && last.round === gathering.round) {
      last.gatherings.push(toGatheringSettingDTO(gathering));
    } else {
      rounds.push({
        round: gathering.round,
        gatherings: [toGatheringSettingDTO(gathering)],
      });
    }
  }
  return rounds;
}

export function buildEventGatheringSettings(
  eventId: number,
  gatherings: EventGatheringEntity[]
): EventGatheringSettingsDTO {
  return { event_id: eventId, rounds: buildRoundSettings(gatherings) };
}
