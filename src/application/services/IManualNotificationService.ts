import {
  CreateManualNotificationInput,
  ManualNotificationSendResult,
} from '../../domain/entities/ManualNotification';

export interface IManualNotificationService {
  sendManualNotification: (
    input: CreateManualNotificationInput
  ) => Promise<ManualNotificationSendResult>;
}
