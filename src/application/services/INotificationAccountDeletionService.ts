export interface INotificationAccountDeletionService {
  deleteUserDeliveryData: (
    userId: number,
    firebaseTokenIds: number[]
  ) => Promise<void>;
  anonymizeUserActorReferences: (userId: number) => Promise<void>;
}
