import type { NotificationRetryBatchResult } from './INotificationRetryService';

export interface NotificationWorkerScheduleResult {
  resolved: boolean;
  generated: boolean;
  sent: number;
  retryWait: number;
  failed: number;
}

export interface INotificationWorkerService {
  enqueueDueSchedules: (now?: Date) => Promise<{
    queuedSchedules: number;
    queuedMessages: number;
  }>;
  processSchedule: (
    scheduleId: number,
    now?: Date
  ) => Promise<NotificationWorkerScheduleResult>;
  retryDueDeliveries: (
    now?: Date,
    limit?: number
  ) => Promise<NotificationRetryBatchResult>;
  recoverProcessingTimeouts: (
    now?: Date,
    limit?: number
  ) => Promise<NotificationRetryBatchResult>;
}
