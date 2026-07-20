import type {
  CreateNotificationScheduleInput,
  DeleteDraftNotificationScheduleResult,
  NotificationScheduleEntity,
  NotificationScheduleListOptions,
  NotificationScheduleListResult,
  NotificationTargetTokenByGroup,
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
  findDraftsByEventAndGroup: (
    eventId: number,
    gatheringGroupId: number
  ) => Promise<NotificationScheduleEntity[]>;
  updateDraft: (
    notificationScheduleId: number,
    input: UpdateDraftNotificationScheduleInput
  ) => Promise<NotificationScheduleEntity | null>;
  deleteDraftsByEventAndGroup: (
    eventId: number,
    gatheringGroupId: number,
    exceptId?: number
  ) => Promise<number>;
  existsUser: (userId: number) => Promise<boolean>;
  existsNotification: (notificationId: number) => Promise<boolean>;
  existsEventGatheringGroup: (
    eventId: number,
    gatheringGroupId: number
  ) => Promise<boolean>;
  claimDue: (now: string) => Promise<NotificationScheduleEntity[]>;
  findTargetTokensByGatheringGroupIds: (
    gatheringGroupIds: number[]
  ) => Promise<NotificationTargetTokenByGroup[]>;
  markSent: (scheduleId: number, fcmMessageId: string) => Promise<void>;
  markFailed: (scheduleId: number, reason: string) => Promise<void>;
}
