export interface NotificationPushDeliverySendTarget {
  deliveryId: number;
  scheduleId: number;
  notificationId: number;
  eventId: number | null;
  notificationType: string;
  title: string;
  body: string;
  importance: number;
  firebaseTokenId: number;
  fcmToken: string;
  platform: 1 | 2;
  attemptCount: number;
}

export interface INotificationPushDeliveryRepository {
  isDeliveryGenerationAllowed: (scheduleId: number) => Promise<boolean>;
  createPendingDeliveries: (scheduleId: number) => Promise<number>;
  findPendingDeliveryIds: (
    scheduleId: number,
    limit: number
  ) => Promise<number[]>;
  markScheduleSending: (scheduleId: number, now: string) => Promise<boolean>;
  claimPendingDelivery: (
    deliveryId: number,
    now: string
  ) => Promise<NotificationPushDeliverySendTarget | null>;
  markDeliverySent: (
    deliveryId: number,
    messageId: string,
    now: string
  ) => Promise<boolean>;
  markDeliveryFailed: (
    deliveryId: number,
    reason: string,
    now: string
  ) => Promise<boolean>;
  completeScheduleIfIdle: (scheduleId: number, now: string) => Promise<boolean>;
  markScheduleFailed: (
    scheduleId: number,
    reason: string,
    now: string
  ) => Promise<boolean>;
}
