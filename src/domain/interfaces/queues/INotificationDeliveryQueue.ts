import type { NotificationDeliveryMessage } from '../../entities/NotificationDelivery';

export interface INotificationDeliveryQueue {
  enqueueMany: (messages: NotificationDeliveryMessage[]) => Promise<void>;
}
