import type {
  EventGatheringChangeSet,
  EventGatheringEntity,
  EventGatheringUpdateInput,
  EventGatheringWriteInput,
} from '../../domain/entities/EventGathering';
import type { IEventGatheringSettingsRepository } from '../../domain/interfaces/repositories/IEventGatheringSettingsRepository';
import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import type { IGatheringSpotRepository } from '../../domain/interfaces/repositories/IGatheringSpotRepository';
import type {
  EventGatheringSettingsDTO,
  RoundSettingInputDTO,
} from '../dto/EventGatheringSettingsDTO';
import { buildEventGatheringSettings } from './eventGatheringRounds';
import type {
  IEventGatheringSettingsService,
  SaveEventGatheringSettingsCommand,
} from './IEventGatheringSettingsService';

interface RequestedGathering extends EventGatheringWriteInput {
  gathering_id?: number;
}

// Round単位の入力を集合予定1件ごとに展開する。以降の差分計算は
// Roundの入れ子を意識せずに済む。
function flattenRounds(rounds: RoundSettingInputDTO[]): RequestedGathering[] {
  return rounds.flatMap(round =>
    round.gatherings.map(gathering => ({
      gathering_id: gathering.gathering_id,
      round: round.round,
      gathering_time: gathering.gathering_time,
      gathering_spot_id: gathering.gathering_spot_id,
    }))
  );
}

function isUnchanged(
  current: EventGatheringEntity,
  requested: EventGatheringWriteInput
): boolean {
  return (
    current.round === requested.round &&
    current.gathering_time === requested.gathering_time &&
    current.gathering_spot_id === requested.gathering_spot_id
  );
}

// D1のエラーはDrizzleに包まれて cause に元のエラーが入ることがあるため、
// 連鎖をたどって文面を集める。
function isForeignKeyError(error: unknown): boolean {
  const visited = new Set<Error>();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    if (current.message.includes('FOREIGN KEY constraint failed')) return true;
    visited.add(current);
    current = current.cause;
  }
  return false;
}

export function createEventGatheringSettingsService(
  eventRepository: IEventRepository,
  gatheringSpotRepository: IGatheringSpotRepository,
  eventGatheringSettingsRepository: IEventGatheringSettingsRepository
): IEventGatheringSettingsService {
  const ensureGatheringSpotsExist = async (gatheringSpotIds: number[]) => {
    const existing =
      await gatheringSpotRepository.findExistingIds(gatheringSpotIds);
    if (gatheringSpotIds.some(id => !existing.has(id))) {
      throw new Error('Gathering spot not found');
    }
  };

  const buildChangeSet = (
    eventId: number,
    current: EventGatheringEntity[],
    requested: RequestedGathering[]
  ): EventGatheringChangeSet => {
    const currentById = new Map(
      current.map(gathering => [gathering.gathering_id, gathering])
    );
    const creates: EventGatheringWriteInput[] = [];
    const updates: EventGatheringUpdateInput[] = [];
    const requestedIds = new Set<number>();

    for (const { gathering_id, ...input } of requested) {
      if (gathering_id === undefined) {
        creates.push(input);
        continue;
      }
      // 現状一覧は対象Event配下だけなので、他Eventの gathering_id もここで弾ける。
      const existing = currentById.get(gathering_id);
      if (!existing) throw new Error('Gathering not found');
      requestedIds.add(gathering_id);
      // 変更のない行は更新しない。updated_at を無駄に進めないため。
      if (!isUnchanged(existing, input)) {
        updates.push({ gathering_id, ...input });
      }
    }

    // リクエストに含まれない既存の集合予定は削除する。参加者が残っているものは
    // 暗黙に消さず、保存前に断る。
    const deleteTargets = current.filter(
      gathering => !requestedIds.has(gathering.gathering_id)
    );
    if (deleteTargets.some(gathering => gathering.member_count > 0)) {
      throw new Error('Gathering in use');
    }

    return {
      event_id: eventId,
      creates,
      updates,
      delete_ids: deleteTargets.map(gathering => gathering.gathering_id),
    };
  };

  return {
    async saveEventGatheringSettings(
      command: SaveEventGatheringSettingsCommand
    ): Promise<EventGatheringSettingsDTO> {
      if (!(await eventRepository.exists(command.event_id))) {
        throw new Error('Event not found');
      }

      const requested = flattenRounds(command.rounds);
      const gatheringSpotIds = Array.from(
        new Set(requested.map(gathering => gathering.gathering_spot_id))
      );
      await ensureGatheringSpotsExist(gatheringSpotIds);

      const current = await eventGatheringSettingsRepository.findByEventId(
        command.event_id
      );
      const changeSet = buildChangeSet(command.event_id, current, requested);

      try {
        await eventGatheringSettingsRepository.apply(changeSet);
      } catch (error) {
        // 事前確認と保存の間に状態が変わると外部キー制約で失敗する。
        // Eventや集合場所が消えていたのか、削除対象に参加者が加わったのかを
        // 切り分ける。
        if (!isForeignKeyError(error)) throw error;
        if (!(await eventRepository.exists(command.event_id))) {
          throw new Error('Event not found');
        }
        await ensureGatheringSpotsExist(gatheringSpotIds);
        throw new Error('Gathering in use');
      }

      return buildEventGatheringSettings(
        command.event_id,
        await eventGatheringSettingsRepository.findByEventId(command.event_id)
      );
    },
  };
}
