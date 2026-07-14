import {
  FcmNotificationResult,
  FcmTestNotificationInput,
  IFcmService,
} from './IFcmService';
import { INotificationService } from './INotificationService';

export function createNotificationService(
  fcmService: IFcmService
): INotificationService {
  return {
    async sendTestNotification(
      input: FcmTestNotificationInput
    ): Promise<FcmNotificationResult> {
      return fcmService.sendTestNotification(input);
    },
  };
}
