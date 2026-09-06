import type {
  CreateNotificationScheduleInput,
  DeleteDraftNotificationScheduleResult,
  DueNotificationSchedule,
  NotificationScheduleEntity,
  NotificationScheduleListOptions,
  NotificationScheduleListResult,
} from '../../entities/NotificationSchedule';

export interface INotificationScheduleRepository {
  create: (
    input: CreateNotificationScheduleInput
  ) => Promise<NotificationScheduleEntity>;
  findAll: (
    options: NotificationScheduleListOptions
  ) => Promise<NotificationScheduleListResult>;
  findById: (
    notificationScheduleId: number
  ) => Promise<NotificationScheduleEntity | null>;
  deleteDraft: (
    notificationScheduleId: number
  ) => Promise<DeleteDraftNotificationScheduleResult>;
  findDraftsByEvent: (eventId: number) => Promise<NotificationScheduleEntity[]>;
  existsFirebaseToken: (firebaseTokenId: number) => Promise<boolean>;
  existsEvent: (eventId: number) => Promise<boolean>;
  existsNotification: (notificationId: number) => Promise<boolean>;
  findDeliveryCandidateIds: (
    dueAt: string,
    staleBefore: string,
    limit: number
  ) => Promise<number[]>;
  claimForDelivery: (
    notificationScheduleIds: number[],
    dueAt: string,
    staleBefore: string
  ) => Promise<DueNotificationSchedule[]>;
  markSent: (scheduleId: number, fcmMessageId: string) => Promise<void>;
  markFailed: (scheduleId: number, reason: string) => Promise<void>;
  // アカウント削除(#265 PR4)専用。created_user_id(通知の作成者、nullable)を
  // NULL化する。通知自体(他の受信者宛て)は残す。対象が無ければ何もしない
  // (冪等)。
  anonymizeCreatedUserId: (userId: number) => Promise<void>;
  // アカウント削除(#265 PR4)専用。指定firebase_token_idに紐づく
  // notification_schedules行(削除対象ユーザーが受信者だった送信履歴)を
  // 物理削除する。firebase_token_idはNOT NULL外部キーのため、
  // firebase_tokens行を削除する前に必ず呼ぶ必要がある。対象が無ければ
  // 何もしない(冪等)。
  //
  // 「誰が何をいつ受け取ったか」の記録がここで失われるが、本人からの
  // 削除要求に対しては送信実績の集計・監査よりも個人データの消去を
  // 優先する方針であることを#263の起票者に確認済み
  // (IFirebaseTokenRepository.deleteByUserId参照)。
  deleteByFirebaseTokenId: (firebaseTokenId: number) => Promise<void>;
}
