import type {
  EventGatheringSettingsDTO,
  RoundSettingInputDTO,
} from '../dto/EventGatheringSettingsDTO';

export interface SaveEventGatheringSettingsCommand {
  event_id: number;
  rounds: RoundSettingInputDTO[];
}

export interface IEventGatheringSettingsService {
  // Event配下の集合予定をリクエストの内容へ置き換え、保存後の一覧を返す。
  // 失敗理由は Error の message で区別する。
  //   'Event not found'          Eventが存在しない
  //   'Gathering not found'      gathering_id が対象Event配下に存在しない
  //   'Gathering spot not found' 集合場所が存在しない
  //   'Gathering in use'         参加者が残っている集合予定を削除しようとした
  saveEventGatheringSettings(
    command: SaveEventGatheringSettingsCommand
  ): Promise<EventGatheringSettingsDTO>;
}
