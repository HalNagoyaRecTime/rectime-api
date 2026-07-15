import type {
  CreateNotificationScheduleInput,
  NotificationScheduleEntity,
  NotificationTargetToken,
} from '../../entities/NotificationSchedule';

export interface INotificationScheduleRepository {
  create: (
    input: CreateNotificationScheduleInput
  ) => Promise<NotificationScheduleEntity>;
  findAll: () => Promise<NotificationScheduleEntity[]>;
  existsUser: (userId: number) => Promise<boolean>;
  existsNotification: (notificationId: number) => Promise<boolean>;
  existsEventGatheringGroup: (
    eventId: number,
    gatheringGroupId: number
  ) => Promise<boolean>;
  claimDue: (now: string) => Promise<NotificationScheduleEntity[]>;
  findTargetTokens: (
    gatheringGroupId: number
  ) => Promise<NotificationTargetToken[]>;
  markSent: (scheduleId: number, fcmMessageId: string) => Promise<void>;
  markFailed: (scheduleId: number, reason: string) => Promise<void>;
}
