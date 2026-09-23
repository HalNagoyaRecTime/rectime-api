import type {
  ClaimedNotificationPushDelivery,
  NotificationDeliveryScheduleCandidate,
} from '../../entities/NotificationDelivery';

export interface INotificationDeliveryRepository {
  findReadySchedules(
    now: string,
    limit: number
  ): Promise<NotificationDeliveryScheduleCandidate[]>;
  prepareResolvedSchedule(scheduleId: number, now: string): Promise<boolean>;
  countPendingDeliveries(scheduleId: number): Promise<number>;
  claimPendingDeliveries(
    scheduleIds: number[],
    now: string,
    limit: number
  ): Promise<ClaimedNotificationPushDelivery[]>;
  markSent(deliveryId: number, messageId: string, now: string): Promise<void>;
  markFailed(deliveryId: number, reason: string, now: string): Promise<void>;
  completeScheduleIfDone(scheduleId: number, now: string): Promise<boolean>;
  markScheduleFailed(
    scheduleId: number,
    reason: string,
    now: string
  ): Promise<boolean>;
}
