export interface INotificationAccountDeletionRepository {
  deleteDirectUserAudiencesByUserId: (userId: number) => Promise<void>;
  deleteRecipientsByUserId: (userId: number) => Promise<void>;
  anonymizeV2ActorReferences: (userId: number) => Promise<void>;
}
