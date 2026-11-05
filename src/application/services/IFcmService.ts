import type { FirebasePlatformName } from '../../domain/entities/FirebaseToken';

export interface FcmNotificationInput {
  token: string;
  platform?: FirebasePlatformName;
  title: string;
  body: string;
  data?: Record<string, string>;
  importance?: number;
}

export interface FcmNotificationResult {
  success: true;
  messageId: string;
}

/** OAuth認証に失敗した場合は、設定復旧まで配信を保留する。 */
export class FcmConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FcmConfigurationError';
  }
}

export class FcmRequestError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly fcmErrorCode: string | null,
    message: string,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'FcmRequestError';
  }
}

export function isPermanentFcmTokenError(error: unknown): boolean {
  if (error instanceof FcmRequestError) {
    return error.fcmErrorCode === 'UNREGISTERED';
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes('UNREGISTERED') || message.includes('invalid token');
}

export interface IFcmService {
  sendNotificationToToken: (
    input: FcmNotificationInput
  ) => Promise<FcmNotificationResult>;
}
