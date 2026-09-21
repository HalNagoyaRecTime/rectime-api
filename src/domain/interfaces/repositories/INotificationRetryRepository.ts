import type { NotificationPushDeliverySendTarget } from './INotificationPushDeliveryRepository';

export interface INotificationRetryRepository {
  isScheduleStopped: (scheduleId: number) => Promise<boolean>;
  findRetryableDeliveryIds: (now: string, limit: number) => Promise<number[]>;
  claimRetryableDelivery: (
    deliveryId: number,
    now: string
  ) => Promise<NotificationPushDeliverySendTarget | null>;
  findTimedOutDeliveryIds: (
    staleBefore: string,
    limit: number
  ) => Promise<number[]>;
  claimTimedOutDelivery: (
    deliveryId: number,
    staleBefore: string,
    now: string
  ) => Promise<NotificationPushDeliverySendTarget | null>;
  scheduleRetry: (
    deliveryId: number,
    nextRetryAt: string,
    reason: string,
    now: string
  ) => Promise<boolean>;
  markDeliveryFailed: (
    deliveryId: number,
    reason: string,
    now: string
  ) => Promise<boolean>;
  deleteFirebaseToken: (firebaseTokenId: number) => Promise<void>;
  markDeliverySent: (
    deliveryId: number,
    messageId: string,
    now: string
  ) => Promise<boolean>;
  completeScheduleIfIdle: (scheduleId: number, now: string) => Promise<boolean>;
}
