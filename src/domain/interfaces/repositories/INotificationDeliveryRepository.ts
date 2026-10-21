import type {
  ClaimedNotificationPushDelivery,
  NotificationDeliveryScheduleCandidate,
} from '../../entities/NotificationDelivery';

export interface INotificationDeliveryRepository {
  findReadySchedules(
    now: string,
    limit: number,
    manualOnly?: boolean
  ): Promise<NotificationDeliveryScheduleCandidate[]>;
  prepareResolvedSchedule(scheduleId: number, now: string): Promise<boolean>;
  countPendingDeliveries(scheduleId: number): Promise<number>;
  markPendingDeliveriesWithoutTokenFailed(
    scheduleId: number,
    reason: string,
    now: string
  ): Promise<number>;
  claimPendingDeliveries(
    scheduleIds: number[],
    now: string,
    limit: number,
    manualOnly?: boolean
  ): Promise<ClaimedNotificationPushDelivery[]>;
  claimRetryDeliveries(
    now: string,
    staleBefore: string,
    limit: number,
    deliveryIds?: number[]
  ): Promise<ClaimedNotificationPushDelivery[]>;
  findDueRetryDeliveryIds(
    now: string,
    staleBefore: string,
    afterId: number,
    limit: number
  ): Promise<number[]>;
  renewDeliveryLease(
    deliveryId: number,
    attemptCount: number,
    now: string,
    staleBefore: string
  ): Promise<boolean>;
  retireUnsendableDeliveries(
    now: string,
    staleBefore: string,
    maxAttempts: number
  ): Promise<number[]>;
  saveRetry(
    deliveryId: number,
    attemptCount: number,
    reason: string,
    nextRetryAt: string,
    now: string
  ): Promise<'retry_wait' | 'stopped' | 'failed' | 'superseded'>;
  markSent(
    deliveryId: number,
    messageId: string,
    now: string,
    attemptCount?: number
  ): Promise<boolean>;
  markFailed(
    deliveryId: number,
    reason: string,
    now: string,
    attemptCount?: number
  ): Promise<boolean>;
  completeScheduleIfDone(scheduleId: number, now: string): Promise<boolean>;
  markScheduleFailed(
    scheduleId: number,
    reason: string,
    now: string
  ): Promise<boolean>;
}
