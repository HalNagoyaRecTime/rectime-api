import type { NotificationWorkerMessage } from '../../entities/NotificationWorkerMessage';

export interface INotificationWorkerQueue {
  enqueueMany: (messages: NotificationWorkerMessage[]) => Promise<void>;
}
