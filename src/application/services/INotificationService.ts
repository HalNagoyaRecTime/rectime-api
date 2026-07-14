import { FcmNotificationResult, FcmTestNotificationInput } from './IFcmService';

export interface INotificationService {
  sendTestNotification: (
    input: FcmTestNotificationInput
  ) => Promise<FcmNotificationResult>;
}
