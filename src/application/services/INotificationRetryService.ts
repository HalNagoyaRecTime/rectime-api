export interface NotificationRetryFailureInput {
  deliveryId: number;
  scheduleId: number;
  firebaseTokenId: number;
  attemptCount: number;
  error: unknown;
}

export interface NotificationRetryResult {
  status: 'retry_wait' | 'failed' | 'skipped';
  scheduleCompleted: boolean;
  tokenDeleted: boolean;
}

export interface NotificationRetryBatchResult {
  checked: number;
  sent: number;
  retried: number;
  failed: number;
}

export interface INotificationRetryService {
  handleFcmFailure: (
    input: NotificationRetryFailureInput,
    now?: Date
  ) => Promise<NotificationRetryResult>;
  retryDueDeliveries: (
    now?: Date,
    limit?: number
  ) => Promise<NotificationRetryBatchResult>;
  recoverProcessingTimeouts: (
    now?: Date,
    limit?: number
  ) => Promise<NotificationRetryBatchResult>;
}
