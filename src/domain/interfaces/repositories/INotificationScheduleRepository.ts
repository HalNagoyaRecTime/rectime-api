import type {
  CreateNotificationScheduleInput,
  DeleteDraftNotificationScheduleResult,
  NotificationScheduleEntity,
  NotificationScheduleListOptions,
  NotificationScheduleListResult,
  UpdateDraftNotificationScheduleInput,
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
  findDraftsByEventAndTokens: (
    eventId: number,
    firebaseTokenIds: number[]
  ) => Promise<NotificationScheduleEntity[]>;
  findActiveFirebaseTokenIdsByGatheringGroup: (
    gatheringGroupId: number
  ) => Promise<number[]>;
  updateDraft: (
    notificationScheduleId: number,
    input: UpdateDraftNotificationScheduleInput
  ) => Promise<NotificationScheduleEntity | null>;
  existsUser: (userId: number) => Promise<boolean>;
  existsNotification: (notificationId: number) => Promise<boolean>;
  existsEvent: (eventId: number) => Promise<boolean>;
  existsFirebaseToken: (firebaseTokenId: number) => Promise<boolean>;
  /**
   * firebaseTokenIdの所有ユーザーが、eventIdに紐づくいずれかの
   * gathering(集合)のグループに所属しているかを確認する。
   */
  existsFirebaseTokenGatheringForEvent: (
    eventId: number,
    firebaseTokenId: number
  ) => Promise<boolean>;
  claimDue: (now: string) => Promise<NotificationScheduleEntity[]>;
  markSent: (scheduleId: number, fcmMessageId: string) => Promise<void>;
  markFailed: (scheduleId: number, reason: string) => Promise<void>;
}
