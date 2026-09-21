export interface NotificationDeliveryGenerationResult {
  status: 'generated' | 'skipped';
  createdCount: number;
}

export interface NotificationDeliverySendResult {
  status: 'sent' | 'failed' | 'retry_wait' | 'skipped';
  scheduleCompleted: boolean;
}

export interface INotificationPushDeliveryService {
  generateDeliveries: (
    scheduleId: number,
    now?: Date
  ) => Promise<NotificationDeliveryGenerationResult>;
  sendDelivery: (
    deliveryId: number,
    now?: Date
  ) => Promise<NotificationDeliverySendResult>;
}
