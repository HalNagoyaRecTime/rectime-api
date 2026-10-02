export interface INotificationAccountDeletionService {
  purgeUserNotificationData: (
    userId: number
  ) => Promise<{ firebaseTokensDeleted: boolean }>;
}
