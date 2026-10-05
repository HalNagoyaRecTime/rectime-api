import type { ClaimedNotificationPushDelivery } from '../../domain/entities/NotificationDelivery';

export type NotificationDeliveryOutcome =
  'sent' | 'failed' | 'retry_wait' | 'stopped' | 'superseded';

export interface INotificationRetryService {
  sendClaimedDelivery(
    delivery: ClaimedNotificationPushDelivery,
    now?: Date
  ): Promise<NotificationDeliveryOutcome>;
  retryDueDeliveries(
    now?: Date
  ): Promise<{ claimed: number; sent: number; failed: number }>;
}
