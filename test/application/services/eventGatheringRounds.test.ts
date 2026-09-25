import { describe, expect, it } from 'vitest';
import { buildEventGatheringSettings } from '../../../src/application/services/eventGatheringRounds';
import type { EventGatheringEntity } from '../../../src/domain/entities/EventGathering';

function gathering(
  overrides: Partial<EventGatheringEntity> & { gathering_id: number }
): EventGatheringEntity {
  return {
    round: 1,
    gathering_time: '10:00',
    gathering_spot_id: 1,
    gathering_spot_name: '出入口①',
    member_count: 0,
    ...overrides,
  };
}

describe('buildEventGatheringSettings', () => {
  it('集合予定が無ければ rounds は空配列になる', () => {
    expect(buildEventGatheringSettings(12, [])).toEqual({
      event_id: 12,
      rounds: [],
    });
  });

  it('同じRoundの集合予定を1つにまとめ、Roundの出現順を保つ', () => {
    const result = buildEventGatheringSettings(12, [
      gathering({ gathering_id: 1, round: 1, gathering_time: '10:00' }),
      gathering({ gathering_id: 2, round: 1, gathering_time: '10:30' }),
      gathering({ gathering_id: 3, round: 3, gathering_time: '09:00' }),
    ]);

    expect(result.rounds.map(round => round.round)).toEqual([1, 3]);
    expect(
      result.rounds.map(round =>
        round.gatherings.map(gathering => gathering.gathering_id)
      )
    ).toEqual([[1, 2], [3]]);
  });

  it('集合場所をネストした形に変換し、参加人数を残す', () => {
    const result = buildEventGatheringSettings(12, [
      gathering({
        gathering_id: 101,
        gathering_time: '10:45',
        gathering_spot_id: 7,
        gathering_spot_name: '体育館前',
        member_count: 16,
      }),
    ]);

    expect(result.rounds[0].gatherings[0]).toEqual({
      gathering_id: 101,
      gathering_time: '10:45',
      gathering_spot: { gathering_spot_id: 7, gathering_spot_name: '体育館前' },
      member_count: 16,
    });
  });
});
