export interface INotificationAccountDeletionRepository {
  deleteRecipientsByUserId: (userId: number) => Promise<void>;
  anonymizeV2ActorReferences: (userId: number) => Promise<void>;
}
