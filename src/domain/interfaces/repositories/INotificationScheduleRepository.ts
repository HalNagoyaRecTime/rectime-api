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
}
