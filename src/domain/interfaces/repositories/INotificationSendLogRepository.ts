export interface INotificationSendLogRepository {
  hasAlreadySent: (input: {
    eventId: number;
    firebaseTokenId: number;
    scheduledForDate: string;
  }) => Promise<boolean>;
  record: (input: {
    eventId: number;
    firebaseTokenId: number;
    scheduledForDate: string;
    messageId: string;
  }) => Promise<void>;
}
