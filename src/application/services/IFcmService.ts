export interface FcmTestNotificationInput {
  title: string;
  body: string;
}

export interface FcmNotificationInput {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmNotificationResult {
  success: true;
  messageId: string;
}

export interface IFcmService {
  sendTestNotification: (
    input: FcmTestNotificationInput
  ) => Promise<FcmNotificationResult>;
  sendNotificationToToken: (
    input: FcmNotificationInput
  ) => Promise<FcmNotificationResult>;
}
