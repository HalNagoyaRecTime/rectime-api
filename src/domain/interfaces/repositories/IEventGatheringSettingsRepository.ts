import type {
  EventGatheringChangeSet,
  EventGatheringEntity,
} from '../../entities/EventGathering';

// Event単位で集合予定をまとめて読み書きする契約。
export interface IEventGatheringSettingsRepository {
  // round ASC, gathering_id ASC の順で返す。
  // レスポンスの並び順をここで確定させ、上位層では並べ替えない。
  findByEventId(eventId: number): Promise<EventGatheringEntity[]>;

  // 差分を1つのトランザクションで適用する。いずれかの文が失敗すると
  // 全体が取り消され、中途半端な状態は残らない。
  // 参加者が残っている集合予定の削除は外部キー制約で失敗する。
  //
  // 変更があれば、対象Eventの lock_version も進める。変更が無い場合は何も書かず、
  // 版も進めない。
  // expectedLockVersion を指定した場合は、Eventの版が取得時点と一致するときだけ
  // 適用する。一致しなければ何も書かず false を返す（Eventが存在しない場合も
  // false）。それ以外は true。
  apply(
    changeSet: EventGatheringChangeSet,
    options?: {
      holdNotificationSyncGatheringIds?: number[];
      expectedLockVersion?: number;
    }
  ): Promise<boolean>;
}
