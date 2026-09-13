import type {
  EventGatheringChangeSet,
  EventGatheringEntity,
} from '../../entities/EventGathering';

// Event単位で集合予定をまとめて読み書きする契約。1件ずつ扱う
// IGatheringRepository とは責務が異なるため、インターフェースを分けている。
export interface IEventGatheringSettingsRepository {
  // round ASC, gathering_time ASC, gathering_id ASC の順で返す。
  // レスポンスの並び順をここで確定させ、上位層では並べ替えない。
  findByEventId(eventId: number): Promise<EventGatheringEntity[]>;

  // 差分を1つのトランザクションで適用する。いずれかの文が失敗すると
  // 全体が取り消され、中途半端な状態は残らない。
  // 参加者が残っている集合予定の削除は外部キー制約で失敗する。
  apply(changeSet: EventGatheringChangeSet): Promise<void>;
}
